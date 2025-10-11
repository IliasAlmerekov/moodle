#!/bin/bash
# Скрипт восстановления Moodle из бэкапа

BACKUP_DIR="/home/admin/moodle/backups"
DATA_DIR="/home/admin/moodle/data"
COMPOSE_DIR="/home/admin/moodle/compose"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Восстановление Moodle из бэкапа ===${NC}"
echo ""

# Показываем доступные бэкапы
echo "Доступные бэкапы базы данных:"
ls -lht "$BACKUP_DIR"/moodle_db_*.sql.gz 2>/dev/null | head -10

echo ""
echo -e "${YELLOW}Введите дату и время бэкапа в формате YYYYMMDD_HHMMSS${NC}"
echo "Например: 20251011_140530"
read -p "Timestamp бэкапа: " TIMESTAMP

if [ -z "$TIMESTAMP" ]; then
    echo -e "${RED}Ошибка: не указан timestamp${NC}"
    exit 1
fi

# Проверяем наличие файлов бэкапа
DB_BACKUP="$BACKUP_DIR/moodle_db_$TIMESTAMP.sql.gz"
DATA_BACKUP="$BACKUP_DIR/moodledata_$TIMESTAMP.tar.gz"
CUSTOM_BACKUP="$BACKUP_DIR/moodle_custom_$TIMESTAMP.tar.gz"

if [ ! -f "$DB_BACKUP" ]; then
    echo -e "${RED}Ошибка: файл бэкапа БД не найден: $DB_BACKUP${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Найдены следующие файлы для восстановления:${NC}"
[ -f "$DB_BACKUP" ] && echo "✓ База данных: $DB_BACKUP"
[ -f "$DATA_BACKUP" ] && echo "✓ Пользовательские файлы: $DATA_BACKUP"
[ -f "$CUSTOM_BACKUP" ] && echo "✓ Кастомные файлы: $CUSTOM_BACKUP"

echo ""
echo -e "${RED}ВНИМАНИЕ! Это действие перезапишет текущие данные!${NC}"
read -p "Продолжить? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Отменено пользователем."
    exit 0
fi

# Останавливаем контейнеры
echo ""
echo "Остановка контейнеров..."
cd "$COMPOSE_DIR" && docker compose down

# Восстанавливаем базу данных
echo ""
echo "Восстановление базы данных..."

# Очищаем старую БД
sudo rm -rf "$DATA_DIR/mariadb"
sudo mkdir -p "$DATA_DIR/mariadb"
sudo chown -R 1001:1001 "$DATA_DIR/mariadb"

# Запускаем только MariaDB
cd "$COMPOSE_DIR" && docker compose up -d mariadb
echo "Ожидание запуска MariaDB..."
sleep 20

# Восстанавливаем дамп
echo "Импорт данных в базу..."
zcat "$DB_BACKUP" | docker exec -i moodle-stack-mariadb-1 mysql \
  -u root \
  -p'Supersecretpassword123!' \
  bitnami_moodle

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ База данных восстановлена${NC}"
else
    echo -e "${RED}✗ ОШИБКА при восстановлении базы данных!${NC}"
    exit 1
fi

# Восстанавливаем файлы данных
if [ -f "$DATA_BACKUP" ]; then
    echo ""
    echo "Восстановление пользовательских файлов..."
    sudo rm -rf "$DATA_DIR/moodledata"
    sudo mkdir -p "$DATA_DIR"
    sudo tar -xzf "$DATA_BACKUP" -C "$DATA_DIR/"
    sudo chown -R 1001:1001 "$DATA_DIR/moodledata"
    sudo chmod -R 777 "$DATA_DIR/moodledata"
    echo -e "${GREEN}✓ Пользовательские файлы восстановлены${NC}"
fi

# Восстанавливаем кастомные файлы
if [ -f "$CUSTOM_BACKUP" ]; then
    echo ""
    echo "Восстановление кастомных файлов..."
    sudo tar -xzf "$CUSTOM_BACKUP" -C "$DATA_DIR/moodle/"
    sudo chown -R 1001:1001 "$DATA_DIR/moodle"
    echo -e "${GREEN}✓ Кастомные файлы восстановлены${NC}"
fi

# Запускаем все контейнеры
echo ""
echo "Запуск всех контейнеров..."
cd "$COMPOSE_DIR" && docker compose up -d

echo ""
echo -e "${GREEN}=== Восстановление завершено! ===${NC}"
echo "Подождите 1-2 минуты, пока Moodle полностью запустится."
echo "Проверьте: http://192.168.178.49:8080"
