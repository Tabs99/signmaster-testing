import { hasLwaCredentials } from '../amazon/lwaConfig.ts'
import { getLwaAccessToken, LwaAuthError } from '../amazon/lwaAuth.ts'

async function main(): Promise<void> {
  if (!hasLwaCredentials()) {
    console.log(
      'Skipping live Amazon LWA authentication: credentials not configured in .env.local',
    )
    return
  }

  try {
    await getLwaAccessToken()
    console.log('Amazon LWA authentication successful')
  } catch (error) {
    if (error instanceof LwaAuthError) {
      console.error(`Amazon LWA authentication failed: ${error.message}`)
    } else if (error instanceof Error) {
      console.error(`Amazon LWA authentication failed: ${error.message}`)
    } else {
      console.error('Amazon LWA authentication failed: unexpected error')
    }

    process.exitCode = 1
  }
}

void main()
