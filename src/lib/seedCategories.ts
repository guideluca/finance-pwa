import { supabase } from '@/lib/supabase'

const DEFAULT_TREE: { name: string; children: string[] }[] = [
  { name: 'Moradia', children: ['Aluguel', 'Condomínio', 'Energia'] },
  { name: 'Alimentação', children: ['Restaurantes', 'Mercado', 'Delivery'] },
  { name: 'Transporte', children: ['Uber', 'Combustível', 'Transporte público'] },
  { name: 'Saúde', children: ['Farmácia', 'Plano'] },
  { name: 'Lazer', children: [] },
  { name: 'Serviços', children: ['Streaming', 'Telefone'] },
  { name: 'Educação', children: [] },
  { name: 'Outros', children: [] },
]

export async function seedDefaultCategoriesIfEmpty(userId: string) {
  const { count, error: cErr } = await supabase
    .from('categories')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (cErr) throw cErr
  if (count && count > 0) return

  for (const root of DEFAULT_TREE) {
    const { data: parent, error: pErr } = await supabase
      .from('categories')
      .insert({ user_id: userId, name: root.name })
      .select('id')
      .single()
    if (pErr) throw pErr
    for (const child of root.children) {
      const { error: chErr } = await supabase.from('categories').insert({
        user_id: userId,
        name: child,
        parent_id: parent!.id,
      })
      if (chErr) throw chErr
    }
  }
}
