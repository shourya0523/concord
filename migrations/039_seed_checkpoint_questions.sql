-- 039_seed_checkpoint_questions.sql
-- Persist teaching question ids on Mode B drill/quiz/concept_lab checkpoints.
-- Only fills empty arrays — never clobbers curated non-empty seeds.

UPDATE canonical.learning_module_checkpoints
SET question_ids = seeded.ids::jsonb,
    updated_at = now()
FROM (VALUES
    (
        'chk_accounting_drill',
        '["cq_6378b2cfd93442a4","cq_c4c3acddbefa4fea","cq_4d057d34ba8e402e","cq_0b2a4cdf26d04ec0","cq_516b5dc422ef4aa9","cq_d5c6df306ee1432e"]'
    ),
    (
        'chk_ev_diagram',
        '["cq_eae136fa2f914030","cq_ccb203dbbac0404c","cq_8a75fe6712ca4fe3","cq_16283e97421d4821"]'
    ),
    (
        'chk_dcf_lesson',
        '["cq_feb4ddab223041e3","cq_0051b6ee2aee4244","cq_0df49d6e682f420d","cq_14f0acda1fd344cb","cq_0220996bda424750","cq_b1b65546c5624d38"]'
    ),
    (
        'chk_lbo_concept_lab',
        '["cq_367c383e66594921","cq_7c29d259b4004a54","cq_a61d97d82d294d52","cq_848e98a343c14dc3","cq_1e567a8fcaa645a7","cq_0195ce6a368d4127"]'
    ),
    (
        'chk_lbo_quiz',
        '["cq_367c383e66594921","cq_aff6fd944e474755","cq_95bbf5673ab7428d","cq_9f7f7b3a2b6d4761","cq_7574e2ee51d2407f","cq_528ffdb15fa84ae6"]'
    ),
    (
        'chk_behavioural_drill',
        '["cq_818c9674c12f4d24","cq_f4c6cf2a201c44a0"]'
    )
) AS seeded(checkpoint_id, ids)
WHERE learning_module_checkpoints.id = seeded.checkpoint_id
  AND jsonb_array_length(COALESCE(learning_module_checkpoints.question_ids, '[]'::jsonb)) = 0;
