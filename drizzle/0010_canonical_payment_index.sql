-- 8B-5c — índice de soporte para el SUM canónico de cobros marcados. Cada cobro
-- (registerJobPaymentAtomic) hace, bajo lock, un SUM de las transactions con
-- `relatedJobId = ? AND isJobPayment = true`. Este índice compuesto convierte ese
-- SUM en un range scan acotado al job en vez de un full scan de transactions (que
-- crece con TODO el histórico). Aditivo, no único (un job tiene varios cobros),
-- online en TiDB/MySQL 8. No modifica ni migra datos. NO aplicada en producción.
CREATE INDEX `idx_tx_related_job_payment` ON `transactions` (`relatedJobId`,`isJobPayment`);