<?php
// This file is part of Moodle - http://moodle.org/

defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'AI chatbot';
$string['enabled'] = 'Enable chatbot';
$string['enabled_desc'] = 'Inject the AI chatbot widget for authenticated non-guest users.';
$string['authsecret'] = 'Authentication secret';
$string['authsecret_desc'] = 'Shared HMAC secret. Must match CHATBOT_AUTH_SECRET in the chatbot proxy.';
$string['apiurl'] = 'Proxy API URL';
$string['apiurl_desc'] = 'Optional proxy origin, for example http://127.0.0.1:3000 during local testing. Leave empty when the proxy is served from the same origin as Moodle.';
$string['assetbaseurl'] = 'Asset base URL';
$string['assetbaseurl_desc'] = 'Optional origin for /chatbot assets. Leave empty when /chatbot is served from the same origin as Moodle.';
