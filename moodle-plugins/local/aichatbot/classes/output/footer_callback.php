<?php
// This file is part of Moodle - http://moodle.org/

namespace local_aichatbot\output;

defined('MOODLE_INTERNAL') || die();

/**
 * Hook callbacks for rendering the AI chatbot.
 *
 * @package local_aichatbot
 */
final class footer_callback {
    /**
     * Adds the chatbot widget before Moodle finalizes footer JavaScript.
     *
     * @param \core\hook\output\before_footer_html_generation $hook
     */
    public static function before_footer_html_generation(
        \core\hook\output\before_footer_html_generation $hook
    ): void {
        require_once(__DIR__ . '/../../lib.php');
        $hook->add_html(local_aichatbot_get_footer_html());
    }
}
