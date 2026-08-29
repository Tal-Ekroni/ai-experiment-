import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.talekroni.jolt',
  appName: 'Jolt',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0b0d12',
  },
}

export default config
