<?php
// This file is part of Moodle - http://moodle.org/

defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'AI Chatbot';
$string['enabled'] = 'Chatbot aktivieren';
$string['enabled_desc'] = 'Blendet das AI-Chatbot-Widget fuer angemeldete Benutzer ein.';
$string['authsecret'] = 'Authentifizierungs-Secret';
$string['authsecret_desc'] = 'Gemeinsames HMAC-Secret. Muss mit CHATBOT_AUTH_SECRET im Chatbot-Proxy uebereinstimmen.';
$string['apiurl'] = 'Proxy-API-URL';
$string['apiurl_desc'] = 'Optionale Proxy-Origin, zum Beispiel http://127.0.0.1:3000 fuer lokale Tests. Leer lassen, wenn der Proxy unter derselben Origin wie Moodle laeuft.';
$string['assetbaseurl'] = 'Asset-Basis-URL';
$string['assetbaseurl_desc'] = 'Optionale Origin fuer /chatbot Assets. Leer lassen, wenn /chatbot unter derselben Origin wie Moodle ausgeliefert wird.';
