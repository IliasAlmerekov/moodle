<?php
// This file is part of Moodle - http://moodle.org/

defined('MOODLE_INTERNAL') || die();

/**
 * Injects the AI chatbot widget before Moodle closes the page body.
 *
 * @return string
 */
function local_aichatbot_before_footer(): string {
    global $USER;

    if (!isloggedin() || isguestuser()) {
        return '';
    }

    if (!get_config('local_aichatbot', 'enabled')) {
        return '';
    }

    $secret = (string) get_config('local_aichatbot', 'authsecret');
    if ($secret === '') {
        return '';
    }

    $userid = (int) $USER->id;
    if ($userid <= 0) {
        return '';
    }

    $ts = (int) round(microtime(true) * 1000);
    $sig = hash_hmac('sha256', $userid . '.' . $ts, $secret);
    $apiurl = local_aichatbot_normalize_origin((string) get_config('local_aichatbot', 'apiurl'));
    $assetbaseurl = local_aichatbot_normalize_origin((string) get_config('local_aichatbot', 'assetbaseurl'));

    $config = [
        'userId' => $userid,
        'ts' => $ts,
        'sig' => $sig,
    ];

    if ($apiurl !== '') {
        $config['apiUrl'] = rtrim($apiurl, '/');
    }

    $encodedconfig = json_encode(
        $config,
        JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
    );

    $assetbase = $assetbaseurl !== '' ? rtrim($assetbaseurl, '/') : '';
    $cssurl = $assetbase . '/chatbot/chatbot.css';
    $jsurl = $assetbase . '/chatbot/chatbot.js?v=20260602';

    return local_aichatbot_render_widget($cssurl, $jsurl, $assetbase, $encodedconfig);
}

/**
 * Normalizes optional external origins used during local development.
 *
 * Moodle's PARAM_URL rejects some localhost/IP forms in admin settings, so the
 * setting accepts trimmed text and this runtime guard allows only http(s)
 * origins before anything is rendered into the page.
 *
 * @param string $value
 * @return string
 */
function local_aichatbot_normalize_origin(string $value): string {
    $value = trim($value);
    if ($value === '') {
        return '';
    }

    $parts = parse_url($value);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
        return '';
    }

    $scheme = strtolower($parts['scheme']);
    if ($scheme !== 'http' && $scheme !== 'https') {
        return '';
    }

    $origin = $scheme . '://' . $parts['host'];
    if (isset($parts['port'])) {
        $origin .= ':' . (int) $parts['port'];
    }

    return $origin;
}

/**
 * Renders the static chatbot shell. Dynamic identity is injected separately.
 *
 * @param string $cssurl
 * @param string $jsurl
 * @param string $assetbase
 * @param string $encodedconfig
 * @return string
 */
function local_aichatbot_render_widget(
    string $cssurl,
    string $jsurl,
    string $assetbase,
    string $encodedconfig
): string {
    $asset = static function (string $path) use ($assetbase): string {
        return htmlspecialchars($assetbase . $path, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    };

    $cssurl = htmlspecialchars($cssurl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $jsurl = htmlspecialchars($jsurl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

    return <<<HTML
<link rel="stylesheet" href="{$cssurl}" />

<script>
window.CHATBOT_CONFIG = {$encodedconfig};
</script>

<button
  type="button"
  id="chatbot-toogle"
  class="chatbot-toogle"
  aria-label="AI Assistent öffnen"
  aria-haspopup="dialog"
  aria-expanded="false"
>
  <img
    src="{$asset('/chatbot/assets/chat_icon.png')}"
    alt=""
    class="chatbot-toggle-icon"
    aria-hidden="true"
  />
</button>

<div
  id="chatbot-window"
  class="chatbot-window hidden"
  role="dialog"
  aria-label="AI Assistent"
>
  <div class="chatbot-header">
    <img
      src="{$asset('/chatbot/assets/moodle_logo.svg')}"
      alt="AI Logo"
      class="chatbot-logo"
    />
    <div class="button-section">
      <button
        type="button"
        id="chatbot-new-chat"
        class="chatbot-new-chat"
        aria-label="New Chat"
      >
        <img
          src="{$asset('/chatbot/assets/write.png')}"
          alt="pencil"
          class="new-chat"
        />
      </button>
      <button
        type="button"
        id="chatbot-close"
        class="chatbot-close"
        aria-label="Schließen"
      >
        ✖
      </button>
    </div>
  </div>

  <div
    id="chatbot-messages"
    class="chatbot-messages"
    role="log"
    aria-live="polite"
    aria-atomic="false"
  >
    <div class="message bot-message">
      <div class="message-content">
        Hallo! Ich bin dein AI-Assistent. Wie kann ich dir helfen?
      </div>
    </div>
  </div>

  <div class="chatbot-input-area">
    <input
      type="text"
      id="chatbot-input"
      class="chatbot-input"
      placeholder="Nachricht eingeben..."
      aria-label="Nachricht eingeben"
      autocomplete="off"
    />
    <button type="button" id="chatbot-send" class="chatbot-send">Senden</button>
  </div>
</div>

<script type="module" src="{$jsurl}"></script>
HTML;
}
