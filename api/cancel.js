/* POST /api/cancel — 주문 취소(회원 본인, 결제 후 7일 이내) */
module.exports = require('../lib/payment.js').cancelHandler;
