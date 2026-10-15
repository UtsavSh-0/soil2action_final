<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All soil analysis, history and field data goes through the external FastAPI backend via `src/services/` (endpoints in `endpoints.ts`, types in `src/types/api.ts`); no Supabase/Edge/server functions duplicate it — FastAPI owns persistence.
- The mock adapter (`src/services/mock-adapter.ts`) is dev-only and every mock result carries `is_mock` and is labelled in the UI — never present mock output as a real analysis.
- The UI never invents agronomic conclusions or doses; it renders backend fields and shows "not specified" when missing. Blank optional measurements are sent as null, never zero.
- UI strings live in `src/lib/i18n.tsx` (en + hi); app pages sit under the `_workspace` pathless layout.
