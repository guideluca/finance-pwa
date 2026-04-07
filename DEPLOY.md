# Publicar no iPhone (Vercel + HTTPS)

## 1. GitHub

```bash
cd finance-pwa
git remote add origin https://github.com/SEU-USUARIO/finance-pwa.git
git branch -M main
git push -u origin main
```

(Crie o repositório vazio no GitHub antes, se ainda não existir.)

## 2. Vercel

1. Aceda a [vercel.com](https://vercel.com) e inicie sessão (ex. com GitHub).
2. **Add New… → Project** → importe o repositório `finance-pwa`.
3. Deixe **Framework Preset: Vite** (ou confirme build `npm run build`, output `dist`).
4. Em **Environment Variables**, adicione:

   - `VITE_SUPABASE_URL` = URL do projeto (Supabase → Settings → API)
   - `VITE_SUPABASE_ANON_KEY` = chave **publishable** (não use `service_role`)

5. **Deploy**. Guarde o URL final (ex. `https://finance-pwa-xxx.vercel.app`).

## 3. Supabase (login no domínio público)

No dashboard Supabase → **Authentication** → **URL Configuration**:

- **Site URL:** o URL da Vercel (ex. `https://finance-pwa-xxx.vercel.app`)
- **Redirect URLs:** acrescente o mesmo URL (e `https://finance-pwa-xxx.vercel.app/**` se o painel permitir)

## 4. iPhone

Safari → abra o URL da Vercel → Partilhar → **Adicionar ao ecrã principal**.

---

O ficheiro `vercel.json` já força o roteamento da SPA (React Router) e o build Vite.
