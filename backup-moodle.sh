#!/bin/bash
# Автоматическое резервное копирование Moodle
# Сохраняет: базу данных, файлы данных, кастомные темы, конфигурацию

BACKUP_DIR="/home/admin/moodle/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
COMPOSE_DIR="/home/admin/moodle/compose"
LOG_FILE="/home/admin/moodle/backup.log"

# Создаем директорию для бэкапов
mkdir -p "$BACKUP_DIR"

# Функция логирования
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Начало резервного копирования ==="

# Включаем режим обслуживания Moodle (опционально, раскомментируйте если нужно)
# log "Включение режима обслуживания..."
# docker exec moodle-stack-moodle-1 php /bitnami/moodle/admin/cli/maintenance.php --enable 2>/dev/null

# 1. Создаем дамп базы данных
log "Создание дампа базы данных..."
docker exec moodle-stack-mariadb-1 mysqldump \
  -u root \
  -p'Supersecretpassword123!' \
  --single-transaction \
  --routines \
  --triggers \
  bitnami_moodle 2>/dev/null | gzip > "$BACKUP_DIR/moodle_db_$TIMESTAMP.sql.gz"

if [ $? -eq 0 ]; then
    log "✓ База данных сохранена: moodle_db_$TIMESTAMP.sql.gz"
else
    log "✗ ОШИБКА при создании дампа базы данных!"
    exit 1
fi

# 2. Архивируем пользовательские файлы (moodledata)
log "Архивация пользовательских файлов..."
if [ -d "/home/admin/moodle/data/moodledata" ]; then
    tar -czf "$BACKUP_DIR/moodledata_$TIMESTAMP.tar.gz" \
      -C /home/admin/moodle/data \
      --warning=no-file-changed \
      moodledata 2>/dev/null

    if [ $? -eq 0 ] || [ $? -eq 1 ]; then
        # Exit code 1 означает "файлы изменились во время архивации" - это OK
        log "✓ Пользовательские файлы сохранены: moodledata_$TIMESTAMP.tar.gz"
    else
        log "✗ ОШИБКА при архивации moodledata!"
    fi
else
    log "⚠ Предупреждение: директория moodledata не найдена"
fi

# 3. Архивируем кастомные темы и плагины (если есть)
log "Архивация кастомных файлов Moodle..."
CUSTOM_DIRS=""
[ -d "/home/admin/moodle/data/moodle/theme" ] && CUSTOM_DIRS="$CUSTOM_DIRS theme/"
[ -d "/home/admin/moodle/data/moodle/local" ] && CUSTOM_DIRS="$CUSTOM_DIRS local/"

if [ -n "$CUSTOM_DIRS" ]; then
    tar -czf "$BACKUP_DIR/moodle_custom_$TIMESTAMP.tar.gz" \
      -C /home/admin/moodle/data/moodle \
      --exclude='cache/*' \
      --exclude='localcache/*' \
      --warning=no-file-changed \
      $CUSTOM_DIRS 2>/dev/null

    if [ $? -eq 0 ] || [ $? -eq 1 ]; then
        log "✓ Кастомные файлы сохранены: moodle_custom_$TIMESTAMP.tar.gz"
    else
        log "⚠ Предупреждение: не удалось сохранить кастомные файлы"
    fi
else
    log "ℹ Кастомные папки (theme/local) не найдены - пропускаем"
fi

# 4. Сохраняем docker-compose.yml и .env
log "Сохранение конфигурации Docker..."
cp "$COMPOSE_DIR/docker-compose.yml" "$BACKUP_DIR/docker-compose_$TIMESTAMP.yml"
cp "$COMPOSE_DIR/.env" "$BACKUP_DIR/env_$TIMESTAMP.txt" 2>/dev/null

log "✓ Конфигурация Docker сохранена"

# 5. Удаляем старые бэкапы (старше 7 дней)
log "Удаление старых бэкапов (старше 7 дней)..."
DELETED=$(find "$BACKUP_DIR" -name "*_*.*" -mtime +7 -delete -print | wc -l)
log "✓ Удалено старых файлов: $DELETED"

# Выключаем режим обслуживания (если включали)
# log "Выключение режима обслуживания..."
# docker exec moodle-stack-moodle-1 php /bitnami/moodle/admin/cli/maintenance.php --disable 2>/dev/null

# 6. Показываем статистику
log "=== Резервное копирование завершено ==="
log "Папка бэкапов: $BACKUP_DIR"
log "Размер последнего бэкапа:"
du -sh "$BACKUP_DIR"/*_$TIMESTAMP.* 2>/dev/null | tee -a "$LOG_FILE"

log "Всего бэкапов в системе:"
ls -1 "$BACKUP_DIR"/*.gz 2>/dev/null | wc -l | xargs echo "Файлов:" | tee -a "$LOG_FILE"
du -sh "$BACKUP_DIR" | tee -a "$LOG_FILE"
