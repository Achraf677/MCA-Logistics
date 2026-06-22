import { supabase } from '../../app/providers'

export type SyncIntegration = 'pennylane_charges' | 'pennylane_clients'

export async function getSyncState(integration: SyncIntegration): Promise<string | null> {
  const { data } = await supabase
    .from('integration_sync_state')
    .select('last_run_at')
    .eq('integration', integration)
    .maybeSingle()
  return (data as { last_run_at: string } | null)?.last_run_at ?? null
}
