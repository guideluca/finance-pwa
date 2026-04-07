import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Category } from '@/types/database'

export function CategoriesPage() {
  const { user } = useAuth()
  const [list, setList] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string>('')

  const load = useCallback(() => {
    if (!user) return
    void (async () => {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order')
        .order('name')
      setList(data ?? [])
    })()
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const roots = useMemo(() => list.filter((c) => !c.parent_id), [list])

  const childrenOf = (id: string) => list.filter((c) => c.parent_id === id)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !name.trim()) return
    await supabase.from('categories').insert({
      user_id: user.id,
      name: name.trim(),
      parent_id: parentId || null,
    })
    setName('')
    setParentId('')
    load()
  }

  const remove = async (id: string) => {
    await supabase.from('categories').delete().eq('id', id)
    load()
  }

  return (
    <div className="space-y-6 pb-24">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Categorias</h1>
        <p className="text-sm text-muted">Árvore com subcategorias</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Subcategoria de (opcional)</Label>
              <select
                className="mt-1 flex h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">— Raiz —</option>
                {list.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parent_id ? `↳ ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">Adicionar</Button>
          </form>
        </CardContent>
      </Card>

      <ul className="space-y-3">
        {roots.map((r) => (
          <li key={r.id} className="rounded-2xl border border-border bg-surface-elevated/80 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{r.name}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(r.id)}>
                Excluir
              </Button>
            </div>
            <ul className="mt-2 space-y-1 border-l border-border pl-3">
              {childrenOf(r.id).map((ch) => (
                <li key={ch.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{ch.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => remove(ch.id)}
                  >
                    Excluir
                  </Button>
                </li>
              ))}
              {childrenOf(r.id).length === 0 ? (
                <li className="text-xs text-muted">Sem subcategorias</li>
              ) : null}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
