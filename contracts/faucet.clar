;; This contract is used to help new users to get free NFTs without having to pay the fees.

(define-map already-claimed
  ((sender principal))
  ((claimed bool)))

(define-constant err-already-claimed u1)
(define-constant err-faucet-empty u2)
(define-constant err-not-same-amount u3)
(define-constant stx-amount u10) ;; must be enough to stay usefull even if the prices raise

(define-private (claim-from-faucet)
    (let ((requester tx-sender)) ;; set a local variable requester = tx-sender
        (asserts! (is-eq 0 (stx-get-balance requester) err-already-claimed)) ;; check if the user is new
        (asserts! (is-none (map-get? claimed-before {sender: requester})) (err err-already-claimed)) ;; check if the user never used this system
        (unwrap! (as-contract (stx-transfer? stx-amount tx-sender requester)) (err err-faucet-empty))
        (map-set claimed-before {sender: requester} {claimed: true})
        (ok stx-amount)))

(define-private (give-back-change (amount uint))
    (let ((requester tx-sender))
        (unwrap! (as-contract (stx-transfer? stx-amount requester tx-sender)) (err err-not-same-amount))
        (ok amount)
)

(define-public (mint-free-nft (nftIndex uint))
    (begin (
        (claim-from-faucet)
        (call-contract? .thisisnumberone-v2 mint-edition nftIndex)
        (let ((change (stx-get-balance tx-sender)))
            (give-back-change change))
    )
)