# Funcionalidade: Captura de E-mail

## O que faz

Coleta o e-mail do usuário para uma futura newsletter ou comunicação direta. O cadastro é salvo no Redis e identificado por um UUID persistido em cookie httpOnly. Um modal simples com campo de e-mail e tela de confirmação de sucesso.

---

## Fluxo do usuário

1. O usuário clica no botão de e-mail na página principal.
2. O `EmailCaptureModal` abre com um campo de texto.
3. O usuário digita o e-mail e confirma.
4. Uma requisição `POST /api/identity` é enviada.
5. Em caso de sucesso: tela de confirmação ("Cadastrado com sucesso!").
6. Em caso de erro: mensagem de erro inline.

---

## Componente

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| `EmailCaptureModal` | `src/components/EmailCaptureModal.tsx` | Modal de cadastro + tela de sucesso |

---

## API Endpoint

### `POST /api/identity`

**Body:**
```json
{ "email": "usuario@exemplo.com" }
```

**Resposta (sucesso):**
```json
{ "ok": true }
```

**Ações executadas:**
1. Gera ou reutiliza um UUID para o usuário (lido do cookie `sc_uid`)
2. Calcula SHA-256 do e-mail
3. Salva/atualiza no Redis:
   ```
   identity:{uuid} → { email, emailHash, ip, createdAt, updatedAt }
   TTL: 1 ano
   ```
4. Define cookie `sc_uid` na resposta (httpOnly, Secure, SameSite=Strict, 1 ano)

---

## Modelo de dados (Redis)

```typescript
interface UserIdentity {
  uuid: string;
  email: string;
  emailHash: string;     // SHA-256, para futuras integrações com ESPs
  ip: string;
  createdAt: string;     // ISO 8601
  updatedAt: string;
}
```

**Chave Redis:** `identity:{uuid}`
**TTL:** 365 dias (renovado a cada atualização)

---

## Cookie de identidade

| Atributo | Valor |
|----------|-------|
| Nome | `sc_uid` |
| Tipo | httpOnly |
| Secure | true (HTTPS apenas) |
| SameSite | Strict |
| MaxAge | 1 ano |

O cookie é definido via `Set-Cookie` na resposta do endpoint, não via JavaScript — protegido contra acesso por scripts da página.

---

## Validação

- E-mail validado no cliente (input `type="email"`)
- Validação adicional no servidor antes de persistir
- Se e-mail inválido: 400 Bad Request

---

## Estado atual

A captura é funcional e os dados ficam no Redis. A integração com um ESP (Mailchimp, Brevo etc.) para envio de newsletters ainda não foi implementada. O `emailHash` está preparado para essa integração sem expor o e-mail bruto a APIs terceiras.
