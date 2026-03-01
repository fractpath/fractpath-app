import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const DEAL_ID = process.argv[2]
if (!DEAL_ID) throw new Error('Missing deal id')

async function getDeal() {
  const { data, error } = await supabase
    .from('deals')
    .select('status, accepted_at, executed_at, funded_at, closed_at')
    .eq('id', DEAL_ID)
    .single()

  if (error) throw error
  return data
}

async function setStatus(status) {
  const { error } = await supabase
    .from('deals')
    .update({ status })
    .eq('id', DEAL_ID)

  if (error) throw error
}

async function run() {
  console.log('Initial:', await getDeal())

  console.log('→ PROPOSED')
  await setStatus('PROPOSED')
  console.log(await getDeal())

  console.log('→ ACCEPTED')
  await setStatus('ACCEPTED')
  console.log(await getDeal())

  console.log('→ EXECUTED')
  await setStatus('EXECUTED')
  console.log(await getDeal())

  console.log('→ FUNDED')
  await setStatus('FUNDED')
  console.log(await getDeal())

  console.log('→ CLOSED')
  await setStatus('CLOSED')
  console.log(await getDeal())

  console.log('Attempt regression → PROPOSED')
  try {
    await setStatus('PROPOSED')
  } catch {
    console.log('Regression blocked ✓')
  }

  console.log('Done.')
}

run().catch(e => {
  console.error('Test failed:', e.message)
  process.exit(1)
})