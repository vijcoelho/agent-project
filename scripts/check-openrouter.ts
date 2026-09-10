import assert from "node:assert/strict";
import { lerCatalogo, textoDaResposta } from "../servidor/ponte.ts";
import { lerChaveOpenRouter } from "../servidor/cotas.ts";

/**
 * O catálogo do OpenRouter é dado de fora e muda sozinho. Estes testes fixam
 * as três decisões que não podem escorregar: o que conta como grátis, quem
 * consegue rodar um agente, e o que dizer quando a conta não informa cota.
 */

// ---- o que é grátis -------------------------------------------------------

const catalogo = {
  data: [
    {
      id: "livre/com-ferramentas",
      name: "Livre",
      context_length: 200000,
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["tools", "temperature"],
    },
    {
      id: "livre/sem-ferramentas",
      context_length: 8000,
      pricing: { prompt: "0.0000000", completion: "0" },
      supported_parameters: ["temperature"],
    },
    {
      id: "pago/barato",
      context_length: 1000000,
      pricing: { prompt: "0", completion: "0.0000004" },
      supported_parameters: ["tools"],
    },
    { id: "sem-preco/declarado", context_length: 1000, supported_parameters: ["tools"] },
  ],
};

const gratis = lerCatalogo(catalogo, true);
assert.deepEqual(
  gratis.map((m) => m.id),
  ["livre/com-ferramentas", "livre/sem-ferramentas"],
  "grátis é preço zero nos DOIS lados; saída cobrada não é grátis, e sem preço declarado também não",
);
assert.equal(gratis[0]!.ferramentas, true);
assert.equal(gratis[1]!.ferramentas, false);
assert.equal(
  gratis[0]!.id,
  "livre/com-ferramentas",
  "quem aceita ferramentas vem primeiro: é o único que roda um agente",
);

const tudo = lerCatalogo(catalogo, false);
assert.equal(tudo.length, 4, "sem o filtro de grátis, ninguém some da lista");
assert.equal(
  tudo[0]!.id,
  "pago/barato",
  "dentro de quem tem ferramentas, o maior contexto vem primeiro",
);

assert.throws(
  () => lerCatalogo({ erro: "sem dados" }, true),
  /sem a lista de modelos/,
  "um catálogo ilegível precisa falar, não devolver lista vazia como se estivesse tudo bem",
);

// ---- a resposta da API ----------------------------------------------------

assert.equal(textoDaResposta({ output_text: "  PRONTO  " }), "PRONTO");
assert.equal(
  textoDaResposta({ output: [{ content: [{ text: "PRONTO" }, { text: "mesmo" }] }] }),
  "PRONTO mesmo",
  "nem todo provedor manda o atalho output_text; o texto precisa ser achado no output",
);
assert.equal(textoDaResposta({}), "");

// ---- a cota ---------------------------------------------------------------

const comCredito = lerChaveOpenRouter("openrouter", {
  data: { label: "minha chave", usage: 2.5, limit: 10 },
});
assert.equal(comCredito.estado, "livre");
assert.equal(comCredito.janelas[0]!.usadoPct, 25);

const gratuita = lerChaveOpenRouter("openrouter", {
  data: { usage: 0, limit: null, is_free_tier: true, rate_limit: { requests: 50, interval: "1d" } },
});
assert.equal(
  gratuita.estado,
  "desconhecido",
  "sem teto em dólar não dá para calcular porcentagem — e desconhecido não é livre",
);
assert.equal(gratuita.plano, "gratuito");
assert.match(gratuita.detalhe!, /50 requisições por 1d/);

const vazia = lerChaveOpenRouter("openrouter", {});
assert.equal(vazia.estado, "desconhecido");
assert.equal(vazia.janelas.length, 0);

console.log("PASS: catálogo, resposta e cota do OpenRouter lidos como o esperado.");
