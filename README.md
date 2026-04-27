# api-code-bundle-packaged

API REST em NestJS que recebe um bundle de scripts JavaScript e o expõe como um arquivo `.js` público, pronto pra ser carregado por um loader injetado no Dashboard Scripts do Chatwoot.

## Arquitetura

```
┌─────────────┐      POST /bundle      ┌──────────────────────────┐      GET /script.js       ┌──────────────────┐
│  CI / CD    │ ─────────────────────► │ api-code-bundle-packaged │ ◄──────────────────────── │  Chatwoot loader │
│  / dev      │   (x-api-key)          │   (SQLite local)         │   (público, no-cache)     │  (no browser)    │
└─────────────┘                        └──────────────────────────┘                           └──────────────────┘
```

- **POST /bundle**: recebe o bundle (string com `<script>...</script>`), extrai o JS e persiste no SQLite. Protegido por `x-api-key`.
- **GET /script.js**: serve o último JS armazenado, com `Content-Type: application/javascript` e cabeçalhos `no-cache`. **Público** — é chamado pelo browser dos agentes.

No Chatwoot Dashboard Scripts você cola **uma vez só** este loader:

```html
<script>
  (function () {
    var s = document.createElement('script');
    s.src = 'https://SUA-API-PUBLICA/script.js';
    s.async = true;
    document.head.appendChild(s);
  })();
</script>
```

A partir daí, todo `POST /bundle` substitui o que sai em `/script.js`. Ao recarregar o dashboard, os agentes pegam a versão mais nova.

## Stack

- NestJS 10 + TypeScript 5
- `class-validator` + `class-transformer`
- `@nestjs/config`
- `better-sqlite3` (persistência local em arquivo SQLite)

## Instalação

```bash
npm install
```

> Nota: `better-sqlite3` é nativo. O `npm install` baixa o binário pré-compilado pra Windows/Linux/macOS automaticamente. Se em algum ambiente exótico ele falhar, instale build tools (`npm i -g node-gyp` + Visual Studio Build Tools no Windows).

## Configuração

```bash
cp .env.example .env
```

| Variável         | Obrigatória | Padrão                  | Descrição                                                                |
| ---------------- | ----------- | ----------------------- | ------------------------------------------------------------------------ |
| `PORT`           | não         | `3000`                  | Porta HTTP da API                                                        |
| `BUNDLE_DB_PATH` | não         | `./data/bundle.sqlite`  | Caminho do arquivo SQLite (diretório é criado automaticamente)           |
| `API_KEY`        | sim         | —                       | Chave que protege o `POST /bundle` (header `x-api-key`)                  |

## Execução

```bash
# desenvolvimento (watch mode)
npm run start:dev

# produção
npm run build
npm run start:prod
```

## Endpoints

### `POST /bundle` — atualiza o bundle

**Headers**

| Header         | Valor                       |
| -------------- | --------------------------- |
| `x-api-key`    | Valor da variável `API_KEY` |
| `Content-Type` | `application/json`          |

**Body**

```json
{
  "content": "<script>código1</script><script>código2</script>"
}
```

**Validações**

- `content` é obrigatório, string não vazia
- `content` deve conter pelo menos uma tag `<script>...</script>` com corpo

**Resposta de sucesso (200 OK)**

```json
{
  "success": true,
  "message": "Bundle deployed",
  "deployedAt": "2026-04-27T13:45:21.000Z"
}
```

**Erros**

| Status | Quando                                                              |
| ------ | ------------------------------------------------------------------- |
| 400    | Body inválido / nenhum bloco `<script>` com conteúdo                |
| 401    | Header `x-api-key` ausente ou inválido                              |

### `GET /script.js` — serve o bundle (público)

Retorna o JavaScript extraído dos blocos `<script>` do último `POST /bundle`.

- `Content-Type: application/javascript; charset=utf-8`
- `Cache-Control: no-cache, no-store, must-revalidate`
- Sem autenticação (precisa ser carregado pelo browser dos agentes)
- Se nunca foi feito deploy, retorna `200` com o corpo `/* nenhum bundle deployado ainda */`

## Exemplos com curl

**Deploy de um bundle**

```bash
curl -X POST http://localhost:3000/bundle \
  -H "Content-Type: application/json" \
  -H "x-api-key: troque-esta-chave-em-producao" \
  -d '{
    "content": "<script>console.log(\"hello\")</script><script>console.log(\"world\")</script>"
  }'
```

**Verificar o que está sendo servido**

```bash
curl -i http://localhost:3000/script.js
```

## Deploy

A imagem Docker está pronta (multi-stage, `node:22-bookworm-slim`, usuário não-root, healthcheck embutido).

### Local com docker-compose

1. Coloque a `API_KEY` em um `.env` na raiz:
   ```env
   API_KEY=sua-chave-forte
   ```
2. Suba:
   ```bash
   docker compose up -d --build
   ```
3. Logs e health:
   ```bash
   docker compose logs -f api
   docker inspect --format='{{.State.Health.Status}}' api-code-bundle-packaged
   ```
4. Smoke test:
   ```bash
   curl -i http://localhost:3000/script.js
   ```

O volume nomeado `bundle-data` persiste o SQLite entre restarts/rebuilds.

### Build standalone (sem compose)

```bash
docker build -t api-code-bundle-packaged:latest .
docker run -d --name api-bundle \
  -p 3000:3000 \
  -e API_KEY=sua-chave-forte \
  -v api-bundle-data:/app/data \
  --restart unless-stopped \
  api-code-bundle-packaged:latest
```

### Deploy em Easypanel / Coolify / Dokku / Render etc.

Todos esses aceitam Dockerfile direto. Configure:

- **Build**: aponte pro repositório, branch e Dockerfile (já está na raiz)
- **Porta**: `3000`
- **Variáveis de ambiente**: `API_KEY` (obrigatória). `PORT` e `BUNDLE_DB_PATH` já têm default razoável no Dockerfile.
- **Volume persistente**: monte um volume em `/app/data`. **Sem isso, todo redeploy zera o bundle armazenado.** No Easypanel: aba "Mounts" → adicionar mount com path `/app/data`.
- **Domínio público com HTTPS**: o `GET /script.js` é chamado pelo browser dos agentes Chatwoot, então precisa estar em domínio público com TLS válido. A maioria dessas plataformas faz isso automaticamente.

### Checklist pós-deploy

1. `curl -i https://SEU-DOMINIO/script.js` → `200 OK`, content-type `application/javascript`
2. Manda um `POST /bundle` real e confirma com `curl https://SEU-DOMINIO/script.js`
3. No Chatwoot Dashboard Scripts (`/super_admin/installation_configs/<id>/edit`), cola o loader **uma vez**:
   ```html
   <script>
     (function () {
       var s = document.createElement('script');
       s.src = 'https://SEU-DOMINIO/script.js';
       s.async = true;
       document.head.appendChild(s);
     })();
   </script>
   ```
4. Recarrega o dashboard de um agente e confirma no DevTools (Network) que `script.js` foi carregado e o JS rodou.

## Persistência

O bundle fica em uma única linha de uma tabela SQLite (`bundle`, id sempre `1`, UPSERT a cada deploy). O arquivo `.sqlite` sobrevive a restarts da API.

Se quiser zerar o que está armazenado, basta apagar o arquivo (`rm ./data/bundle.sqlite*` — incluindo os arquivos `-wal` e `-shm` do journal mode). A tabela é recriada no próximo boot.

## Estrutura do projeto

```
src/
  bundle/
    bundle.controller.ts      POST /bundle
    bundle.service.ts         extrai JS dos <script> e chama o storage
    bundle.module.ts
    dto/
      create-bundle.dto.ts
  script/
    script.controller.ts      GET /script.js (público)
    script.module.ts
  storage/
    storage.service.ts        wrapper do better-sqlite3
    storage.module.ts
  common/
    decorators/
      public.decorator.ts     marca rotas como públicas
    filters/
      http-exception.filter.ts
    guards/
      api-key.guard.ts        valida x-api-key (respeita @Public())
  app.module.ts
  main.ts
.env.example
README.md
```
