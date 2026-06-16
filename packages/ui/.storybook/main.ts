import type { StorybookConfig } from '@storybook/react-vite'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import type { PluginOption } from 'vite'
import { mergeConfig } from 'vite'

const appOnlyPluginPrefixes = ['tanstack']

function withoutAppOnlyPlugins(plugins: PluginOption[] = []): PluginOption[] {
  return plugins
    .map((plugin) => {
      if (Array.isArray(plugin)) {
        return withoutAppOnlyPlugins(plugin)
      }

      if (
        plugin &&
        typeof plugin === 'object' &&
        'name' in plugin &&
        typeof plugin.name === 'string' &&
        appOnlyPluginPrefixes.some((prefix) => plugin.name.startsWith(prefix))
      ) {
        return false
      }

      return plugin
    })
    .filter(Boolean)
}

const config: StorybookConfig = {
  stories: ['../components/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: async (config) => {
    config.plugins = withoutAppOnlyPlugins(config.plugins)

    return mergeConfig(config, {
      resolve: {
        alias: { '@': path.resolve(import.meta.dirname, '..') },
      },
      plugins: [tailwindcss()],
    })
  },
}

export default config
