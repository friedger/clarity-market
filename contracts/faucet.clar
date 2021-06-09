;; This contract is used to help new users to get free NFTs without having to pay the fees.

(define-map already-claimed
  ((sender principal))
  ((claimed bool)))

(define-constant err-already-claimed u1)
(define-constant err-faucet-empty u2)
(define-constant err-not-same-amount u3)
(define-constant stx-amount u10) ;; must be enough to stay usefull even if the prices raise

(define-public (claim-from-faucet)
    (let ((requester tx-sender)) ;; set a local variable requester = tx-sender
        (asserts! (is-none (map-get? claimed-before {sender: requester})) (err err-already-claimed))
        (unwrap! (as-contract (stx-transfer? stx-amount tx-sender requester)) (err err-faucet-empty))
        (map-set claimed-before {sender: requester} {claimed: true})
        (ok stx-amount)))

(define-public (give-back-change (amount uint))
    (let ((requester tx-sender))
        (unwrap! (as-contract (stx-transfer? stx-amount requester tx-sender)) (err err-not-same-amount))
        (ok amount)
)