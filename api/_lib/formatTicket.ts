export function formatVerifiedTicket(booking: any) {
  return {
    id: booking.bookingId,
    createdAt: typeof booking.createdAt === 'string' ? booking.createdAt : new Date().toISOString(),
    expiresAt: booking.expiresAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    source: { id: booking.sourceId, name: booking.sourceName },
    destination: { id: booking.destinationId, name: booking.destinationName },
    passengerCount: booking.passengerCount,
    ticketType: booking.ticketType,
    baseFare: booking.baseFare,
    totalFare: booking.totalFare,
    status: 'ACTIVE',
    paymentStatus: 'PAID',
    isDemo: true,
    disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
    razorpayOrderId: booking.razorpayOrderId,
    razorpayPaymentId: booking.razorpayPaymentId,
    qrPayload: booking.qrPayload || '',
  };
}
