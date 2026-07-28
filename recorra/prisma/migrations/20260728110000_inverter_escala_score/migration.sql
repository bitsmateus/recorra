-- O score passa a representar qualidade de pagamento: quanto maior, melhor.
-- A inversão preserva a faixa de risco atual de cada registro.
UPDATE "risk_scores"
SET
  "score" = 100 - "score",
  "fatores" = COALESCE((
    SELECT jsonb_agg(
      CASE
        WHEN fator ? 'pontos'
          THEN jsonb_set(fator, '{pontos}', to_jsonb(-((fator->>'pontos')::int)))
        ELSE fator
      END
    )
    FROM jsonb_array_elements("fatores"::jsonb) AS fator
  ), '[]'::jsonb);
