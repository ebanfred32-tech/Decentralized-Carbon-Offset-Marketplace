(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-BASELINE u101)
(define-constant ERR-INVALID-USAGE u102)
(define-constant ERR-INVALID-DEVICE-ID u103)
(define-constant ERR-INVALID-TIMESTAMP u104)
(define-constant ERR-INVALID-REDUCTION u105)
(define-constant ERR-DEVICE-ALREADY-REGISTERED u106)
(define-constant ERR-DEVICE-NOT-FOUND u107)
(define-constant ERR-INVALID-ORACLE u108)
(define-constant ERR-INVALID-REDUCTION-TYPE u109)
(define-constant ERR-INVALID-CO2-FACTOR u110)
(define-constant ERR-INVALID-UPDATE-PARAM u111)
(define-constant ERR-MAX-DEVICES-EXCEEDED u112)
(define-constant ERR-INVALID-LOCATION u113)
(define-constant ERR-INVALID-UNIT u114)
(define-constant ERR-INVALID-STATUS u115)
(define-constant ERR-INVALID-OWNER u116)
(define-constant ERR-ORACLE-NOT-VERIFIED u117)
(define-constant ERR-INVALID-PERIOD u118)
(define-constant ERR-CALCULATION-OVERFLOW u119)
(define-constant ERR-INVALID-VERIFICATION u120)

(define-data-var next-device-id uint u0)
(define-data-var max-devices uint u10000)
(define-data-var oracle-principal (optional principal) none)
(define-data-var default-co2-factor uint u400)
(define-data-var default-baseline uint u1000)
(define-data-var admin-principal principal tx-sender)

(define-map devices
  uint
  {
    owner: principal,
    device-type: (string-utf8 50),
    baseline: uint,
    location: (string-utf8 100),
    unit: (string-utf8 20),
    status: bool,
    last-timestamp: uint,
    co2-factor: uint
  }
)

(define-map reductions
  uint
  {
    device-id: uint,
    usage: uint,
    timestamp: uint,
    reduction: uint,
    verifier: principal,
    reduction-type: (string-utf8 50),
    period: uint
  }
)

(define-map devices-by-owner
  principal
  (list 100 uint)
)

(define-read-only (get-device (id uint))
  (map-get? devices id)
)

(define-read-only (get-reduction (id uint))
  (map-get? reductions id)
)

(define-read-only (get-devices-by-owner (owner principal))
  (map-get? devices-by-owner owner)
)

(define-read-only (is-device-registered (id uint))
  (is-some (map-get? devices id))
)

(define-private (validate-device-id (id uint))
  (if (> id u0)
      (ok true)
      (err ERR-INVALID-DEVICE-ID))
)

(define-private (validate-baseline (baseline uint))
  (if (> baseline u0)
      (ok true)
      (err ERR-INVALID-BASELINE))
)

(define-private (validate-usage (usage uint))
  (if (>= usage u0)
      (ok true)
      (err ERR-INVALID-USAGE))
)

(define-private (validate-timestamp (ts uint))
  (if (> ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-reduction-type (type (string-utf8 50)))
  (if (or (is-eq type "energy") (is-eq type "transport") (is-eq type "waste"))
      (ok true)
      (err ERR-INVALID-REDUCTION-TYPE))
)

(define-private (validate-co2-factor (factor uint))
  (if (> factor u0)
      (ok true)
      (err ERR-INVALID-CO2-FACTOR))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-unit (unit (string-utf8 20)))
  (if (or (is-eq unit "kWh") (is-eq unit "km") (is-eq unit "kg"))
      (ok true)
      (err ERR-INVALID-UNIT))
)

(define-private (validate-period (period uint))
  (if (and (> period u0) (<= period u365))
      (ok true)
      (err ERR-INVALID-PERIOD))
)

(define-private (validate-owner (owner principal))
  (if (not (is-eq owner 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-OWNER))
)

(define-public (set-oracle-principal (oracle principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-owner oracle))
    (var-set oracle-principal (some oracle))
    (ok true)
  )
)

(define-public (set-default-co2-factor (factor uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-co2-factor factor))
    (var-set default-co2-factor factor)
    (ok true)
  )
)

(define-public (set-default-baseline (baseline uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin-principal)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-baseline baseline))
    (var-set default-baseline baseline)
    (ok true)
  )
)

(define-public (register-device
  (device-type (string-utf8 50))
  (baseline uint)
  (location (string-utf8 100))
  (unit (string-utf8 20))
  (co2-factor uint)
)
  (let (
        (next-id (var-get next-device-id))
        (current-max (var-get max-devices))
        (oracle (var-get oracle-principal))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-DEVICES-EXCEEDED))
    (try! (validate-reduction-type device-type))
    (try! (validate-baseline baseline))
    (try! (validate-location location))
    (try! (validate-unit unit))
    (try! (validate-co2-factor co2-factor))
    (asserts! (is-some oracle) (err ERR-ORACLE-NOT-VERIFIED))
    (map-set devices next-id
      {
        owner: tx-sender,
        device-type: device-type,
        baseline: baseline,
        location: location,
        unit: unit,
        status: true,
        last-timestamp: block-height,
        co2-factor: co2-factor
      }
    )
    (map-set devices-by-owner tx-sender
      (unwrap! (as-max-len? (append (default-to (list) (map-get? devices-by-owner tx-sender)) next-id) u100) (err ERR-INVALID-UPDATE-PARAM))
    )
    (var-set next-device-id (+ next-id u1))
    (print { event: "device-registered", id: next-id })
    (ok next-id)
  )
)

(define-public (submit-reduction
  (device-id uint)
  (usage uint)
  (timestamp uint)
  (reduction-type (string-utf8 50))
  (period uint)
)
  (let ((device (map-get? devices device-id))
        (oracle (unwrap! (var-get oracle-principal) (err ERR-ORACLE-NOT-VERIFIED)))
        (next-reduction-id (+ (len (map-keys reductions)) u1)))
    (match device
      d
        (begin
          (asserts! (is-eq (get owner d) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (get status d) (err ERR-INVALID-STATUS))
          (try! (validate-usage usage))
          (try! (validate-timestamp timestamp))
          (try! (validate-reduction-type reduction-type))
          (try! (validate-period period))
          (asserts! (is-eq tx-sender oracle) (err ERR-NOT-AUTHORIZED))
          (let (
                (baseline (get baseline d))
                (co2-factor (get co2-factor d))
                (reduction (if (< usage baseline) (* (- baseline usage) co2-factor) u0))
              )
            (asserts! (> reduction u0) (err ERR-INVALID-REDUCTION))
            (map-set reductions next-reduction-id
              {
                device-id: device-id,
                usage: usage,
                timestamp: timestamp,
                reduction: reduction,
                verifier: oracle,
                reduction-type: reduction-type,
                period: period
              }
            )
            (print { event: "reduction-submitted", id: next-reduction-id, reduction: reduction })
            (ok reduction)
          )
        )
      (err ERR-DEVICE-NOT-FOUND)
    )
  )
)

(define-public (update-device
  (device-id uint)
  (new-baseline uint)
  (new-co2-factor uint)
  (new-location (string-utf8 100))
)
  (let ((device (map-get? devices device-id)))
    (match device
      d
        (begin
          (asserts! (is-eq (get owner d) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-baseline new-baseline))
          (try! (validate-co2-factor new-co2-factor))
          (try! (validate-location new-location))
          (map-set devices device-id
            (merge d
              {
                baseline: new-baseline,
                co2-factor: new-co2-factor,
                location: new-location,
                last-timestamp: block-height
              }
            )
          )
          (print { event: "device-updated", id: device-id })
          (ok true)
        )
      (err ERR-DEVICE-NOT-FOUND)
    )
  )
)

(define-public (get-device-count)
  (ok (var-get next-device-id))
)

(define-public (verify-reduction (reduction-id uint))
  (ok (is-some (map-get? reductions reduction-id)))
)