<?php
// This file is part of Moodle - http://moodle.org/

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage('local_aichatbot', get_string('pluginname', 'local_aichatbot'));

    $settings->add(new admin_setting_configcheckbox(
        'local_aichatbot/enabled',
        get_string('enabled', 'local_aichatbot'),
        get_string('enabled_desc', 'local_aichatbot'),
        0
    ));

    $settings->add(new admin_setting_configpasswordunmask(
        'local_aichatbot/authsecret',
        get_string('authsecret', 'local_aichatbot'),
        get_string('authsecret_desc', 'local_aichatbot'),
        ''
    ));

    $settings->add(new admin_setting_configtext(
        'local_aichatbot/apiurl',
        get_string('apiurl', 'local_aichatbot'),
        get_string('apiurl_desc', 'local_aichatbot'),
        '',
        PARAM_RAW_TRIMMED
    ));

    $settings->add(new admin_setting_configtext(
        'local_aichatbot/assetbaseurl',
        get_string('assetbaseurl', 'local_aichatbot'),
        get_string('assetbaseurl_desc', 'local_aichatbot'),
        '',
        PARAM_RAW_TRIMMED
    ));

    $ADMIN->add('localplugins', $settings);
}
