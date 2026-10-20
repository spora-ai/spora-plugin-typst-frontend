/**
 * Vitest setup — installs the plugin's i18n instance on every mounted
 * component.
 *
 * The locale is pinned to `en`: `src/locales/en.json` is a generated
 * identity map, so every message renders as its English source and
 * the existing English assertions keep holding. A test that needs
 * another language installs its own instance.
 */
import { config } from '@vue/test-utils'
import { createPluginI18n } from '../src/i18n'

config.global.plugins = [createPluginI18n('en')]
