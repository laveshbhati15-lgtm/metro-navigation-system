import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Station, MetroRoute, LineCode } from '@/core/graph/types';
import type { TicketType, DemoTicket } from './types';
import { useTicketStore } from './ticketStore';
import { StationSearch } from '@/components/ui/StationSearch';
import { DemoTicketCard } from './DemoTicketCard';
import { metroGraph } from '@/core/graph/MetroGraph';
import { planRoutes } from '@/core/algorithm/routePlanner';
import { estimateFare, formatDuration } from '@/utils/formatters';
import { useAuth } from '@/context/AuthContext';
import {
  loadRazorpayCheckoutScript,
  createPaymentOrder,
  verifyServerPayment,
} from '@/services/paymentService';

type BookingStep =
  | 'CONFIG'
  | 'CREATING_ORDER'
  | 'AWAITING_PAYMENT'
  | 'VERIFYING'
  | 'CONFIRMED'
  | 'FAILED';

export const BookingModal: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth() || {};

  const isBookingModalOpen = useTicketStore((s) => s.isBookingModalOpen);
  const closeBookingModal = useTicketStore((s) => s.closeBookingModal);
  const preselectedSource = useTicketStore((s) => s.preselectedSource);
  const preselectedDestination = useTicketStore((s) => s.preselectedDestination);
  const preselectedRoute = useTicketStore((s) => s.preselectedRoute);
  const createDemoTicket = useTicketStore((s) => s.createDemoTicket);
  const saveVerifiedTicket = useTicketStore((s) => s.saveVerifiedTicket);
  const cancelDemoTicket = useTicketStore((s) => s.cancelDemoTicket);
  const openHistoryModal = useTicketStore((s) => s.openHistoryModal);

  // Form State
  const [source, setSource] = useState<Station | null>(null);
  const [destination, setDestination] = useState<Station | null>(null);
  const [passengerCount, setPassengerCount] = useState<number>(1);
  const [ticketType, setTicketType] = useState<TicketType>('SINGLE');

  // Payment Execution State
  const [step, setStep] = useState<BookingStep>('CONFIG');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedTicketId, setConfirmedTicketId] = useState<string | null>(null);
  const [devFallbackAvailable, setDevFallbackAvailable] = useState<boolean>(false);

  // Sync state when modal opens
  useEffect(() => {
    if (isBookingModalOpen) {
      setSource(preselectedSource);
      setDestination(preselectedDestination);
      setPassengerCount(1);
      setTicketType('SINGLE');
      setStep('CONFIG');
      setErrorMessage(null);
      setConfirmedTicketId(null);
      setDevFallbackAvailable(false);
    }
  }, [isBookingModalOpen, preselectedSource, preselectedDestination]);

  // Compute live route if stations change
  const currentRoute: MetroRoute | null = useMemo(() => {
    if (
      preselectedRoute &&
      source?.id === preselectedSource?.id &&
      destination?.id === preselectedDestination?.id
    ) {
      return preselectedRoute;
    }

    if (source && destination && source.id !== destination.id) {
      const routes = planRoutes(metroGraph, source.id, destination.id);
      return routes[0] ?? null;
    }
    return null;
  }, [source, destination, preselectedRoute, preselectedSource, preselectedDestination]);

  // Calculate fare (client preview — server validates independently)
  const fareCalculation = useMemo(() => {
    if (!currentRoute) return { baseFare: 0, totalFare: 0 };
    const base = estimateFare(currentRoute.totalStations).amount;
    const multiplier = ticketType === 'RETURN' ? 1.8 : 1;
    const total = Math.round(base * passengerCount * multiplier);
    return { baseFare: base, totalFare: total };
  }, [currentRoute, passengerCount, ticketType]);

  // Fallback handler for unverified demo creation
  const handleIssueUnverifiedDemo = useCallback(() => {
    if (!source || !destination || !currentRoute) return;

    const unverifiedTicket = createDemoTicket({
      source,
      destination,
      route: currentRoute,
      passengerCount,
      ticketType,
      paymentStatus: 'UNVERIFIED_DEMO',
      isVerifiedPayment: false,
    });

    setConfirmedTicketId(unverifiedTicket.id);
    setStep('CONFIRMED');
  }, [source, destination, currentRoute, passengerCount, ticketType, createDemoTicket]);

  // Primary payment initiator
  const handleProceedToPayment = async () => {
    if (!source || !destination || !currentRoute) return;

    setStep('CREATING_ORDER');
    setErrorMessage(null);
    setDevFallbackAvailable(false);

    try {
      // 1. Ensure Razorpay Checkout script is loaded
      const isScriptLoaded = await loadRazorpayCheckoutScript();
      if (!isScriptLoaded || typeof window.Razorpay === 'undefined') {
        throw new Error(
          'Could not load Razorpay Checkout script. Check your internet connection.'
        );
      }

      // 2. Fetch user ID token if signed in
      let idToken: string | undefined;
      if (user) {
        try {
          idToken = await user.getIdToken();
        } catch {
          // Proceed as guest demo
        }
      }

      // 3. Request server-side order creation
      const orderData = await createPaymentOrder({
        sourceId: source.id,
        destinationId: destination.id,
        passengerCount,
        ticketType,
        idToken,
      });

      setStep('AWAITING_PAYMENT');

      // 4. Configure Razorpay Standard Checkout in TEST MODE
      const razorpayOptions = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Delhi Metro Navigator (Demo)',
        description: `${ticketType === 'RETURN' ? 'Return' : 'Single'} Transit Pass (${passengerCount} Passenger) · Test Mode`,
        order_id: orderData.orderId,
        prefill: {
          name: user?.displayName || 'Delhi Commuter',
          email: user?.email || '',
        },
        theme: {
          color: '#0891b2', // Cyan brand accent
        },
        modal: {
          backdropclose: false,
          escape: false,
          handleback: true,
          ondismiss: () => {
            setStep('CONFIG');
            setErrorMessage('Payment cancelled or dismissed by passenger.');
          },
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          setStep('VERIFYING');

          try {
            // 5. Submit signature for server-side cryptographic verification
            const verifyResult = await verifyServerPayment({
              bookingId: orderData.bookingId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });

            if (verifyResult.success && verifyResult.ticket) {
              const linesUsed: LineCode[] = Array.from(
                new Set(currentRoute.edges.map((e) => e.line))
              );

              const verifiedTicket: DemoTicket = {
                id: verifyResult.ticket.id,
                createdAt: verifyResult.ticket.createdAt,
                expiresAt: verifyResult.ticket.expiresAt,
                source,
                destination,
                routeSummary: {
                  label: currentRoute.label,
                  totalTimeSeconds: currentRoute.totalTimeSeconds,
                  totalStations: currentRoute.totalStations,
                  interchangeCount: currentRoute.interchangeCount,
                  lines: linesUsed,
                  interchangeStations: currentRoute.interchanges.map((s) => s.name),
                },
                passengerCount: verifyResult.ticket.passengerCount || passengerCount,
                ticketType: verifyResult.ticket.ticketType || ticketType,
                baseFare: verifyResult.ticket.baseFare || fareCalculation.baseFare,
                totalFare: verifyResult.ticket.totalFare || fareCalculation.totalFare,
                status: 'ACTIVE',
                paymentStatus: 'PAID',
                isVerifiedPayment: true,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
                qrPayload: verifyResult.ticket.qrPayload,
              };

              saveVerifiedTicket(verifiedTicket);
              setConfirmedTicketId(verifiedTicket.id);
              setStep('CONFIRMED');
            } else {
              throw new Error('Server verification response did not contain a valid ticket.');
            }
          } catch (verifyError: any) {
            console.error('Payment verification failed:', verifyError);
            setStep('FAILED');
            setErrorMessage(
              verifyError.message ||
                'Payment verification failed. No ticket was issued.'
            );
          }
        },
      };

      const razorpayInstance = new window.Razorpay(razorpayOptions);
      razorpayInstance.on('payment.failed', (failedResponse: any) => {
        console.warn('Razorpay payment failed:', failedResponse);
        setStep('FAILED');
        setErrorMessage(
          failedResponse.error?.description ||
            'Payment failed or was declined by test provider.'
        );
      });

      razorpayInstance.open();
    } catch (orderError: any) {
      console.error('Order creation error:', orderError);
      setStep('FAILED');
      setErrorMessage(
        orderError.message ||
          'Failed to initialize payment order. Backend may be offline or credentials unconfigured.'
      );
      setDevFallbackAvailable(true);
    }
  };

  const confirmedTicket = useTicketStore((s) =>
    confirmedTicketId ? s.getTicketById(confirmedTicketId) : undefined
  );

  if (!isBookingModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-md overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <div className="relative w-full max-w-xl my-8">
        {/* Close Button Top-Right */}
        <button
          type="button"
          onClick={closeBookingModal}
          disabled={step === 'CREATING_ORDER' || step === 'VERIFYING'}
          className="absolute -top-3 -right-3 z-20 w-8 h-8 rounded-full bg-navy-800 border border-white/20 text-gray-300 hover:text-white hover:bg-navy-700 disabled:opacity-40 flex items-center justify-center shadow-lg transition-colors"
          aria-label={t('common.close')}
        >
          ✕
        </button>

        {confirmedTicket ? (
          /* ── Confirmed E-Ticket View ── */
          <div className="space-y-4">
            <DemoTicketCard
              ticket={confirmedTicket}
              onCancel={cancelDemoTicket}
              onClose={closeBookingModal}
            />

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmedTicketId(null);
                  setStep('CONFIG');
                  setErrorMessage(null);
                }}
                className="py-2.5 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-xs font-mono font-semibold text-gray-300 hover:text-white transition-colors"
              >
                + {t('booking.bookAnotherBtn')}
              </button>
              <button
                type="button"
                onClick={() => {
                  closeBookingModal();
                  openHistoryModal();
                }}
                className="py-2.5 px-4 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-xs font-mono font-semibold text-cyan-300 hover:text-white transition-colors"
              >
                {t('booking.openInVaultBtn')}
              </button>
            </div>
          </div>
        ) : (
          /* ── Ticket Configuration & Payment Checkout View ── */
          <div className="glass-card bg-navy-900/95 border border-white/10 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div>
                <h3
                  id="booking-modal-title"
                  className="text-lg sm:text-xl font-bold font-display text-white tracking-tight flex items-center gap-2"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                  {t('booking.modalTitle')}
                </h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">
                  Razorpay Standard Checkout · Test Mode
                </p>
              </div>

              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 font-bold uppercase tracking-wider">
                Test Mode
              </span>
            </div>

            {/* Strict Notice */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-200">
              <span className="text-base leading-none">⚠️</span>
              <div>
                <strong className="font-bold block text-amber-100">
                  DEMO — NOT VALID FOR METRO TRAVEL
                </strong>
                <p className="text-[11px] text-amber-200/80 mt-0.5">
                  Transactions use simulated test currency in Razorpay Sandbox. No real money is charged.
                </p>
              </div>
            </div>

            {/* Error & Status Alerts */}
            {errorMessage && (
              <div className="p-4 rounded-2xl bg-red-500/15 border border-red-500/30 text-xs space-y-2">
                <div className="flex items-start gap-2.5 text-red-200 font-mono">
                  <span className="text-red-400 text-sm">✕</span>
                  <p className="flex-1 leading-relaxed">{errorMessage}</p>
                </div>

                {devFallbackAvailable && (
                  <div className="pt-2 border-t border-red-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-[11px] text-gray-300">
                      Need to inspect UI without live backend emulators?
                    </span>
                    <button
                      type="button"
                      onClick={handleIssueUnverifiedDemo}
                      className="py-1.5 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-[11px] font-mono font-bold transition-colors"
                    >
                      Issue Unverified Demo Ticket
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Station Pickers */}
            <div className="space-y-4">
              <StationSearch
                label={t('hero.fromLabel')}
                placeholder={t('planner.originPlaceholder')}
                value={source}
                onChange={(s) => {
                  setSource(s);
                  setErrorMessage(null);
                }}
                excludeId={destination?.id}
                id="booking-source-station"
              />

              <StationSearch
                label={t('hero.toLabel')}
                placeholder={t('planner.destinationPlaceholder')}
                value={destination}
                onChange={(s) => {
                  setDestination(s);
                  setErrorMessage(null);
                }}
                excludeId={source?.id}
                id="booking-destination-station"
              />
            </div>

            {/* Route Summary */}
            {currentRoute && (
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 font-mono">Route Type</span>
                  <span className="font-semibold text-cyan-300">{currentRoute.label}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 font-mono">Travel Metrics</span>
                  <span className="text-gray-200 font-mono">
                    {currentRoute.totalStations} stations · ~{formatDuration(currentRoute.totalTimeSeconds)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 font-mono">Interchanges</span>
                  <span className="text-gray-200 font-mono">
                    {currentRoute.interchangeCount === 0
                      ? 'Direct (0 line changes)'
                      : `${currentRoute.interchangeCount} interchange(s)`}
                  </span>
                </div>
              </div>
            )}

            {/* Passenger Count & Ticket Type Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Passenger Counter */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
                <div>
                  <label className="text-xs font-mono font-semibold text-gray-300 block">
                    {t('booking.passengerCountLabel')}
                  </label>
                  <span className="text-[11px] text-gray-500 font-mono">Max 6 passengers</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPassengerCount((p) => Math.max(1, p - 1))}
                    disabled={passengerCount <= 1 || step !== 'CONFIG'}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-white text-base font-bold transition-colors"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-bold text-white font-mono">
                    {passengerCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPassengerCount((p) => Math.min(6, p + 1))}
                    disabled={passengerCount >= 6 || step !== 'CONFIG'}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-white text-base font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Journey Type Toggle */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                <label className="text-xs font-mono font-semibold text-gray-300 block mb-2">
                  {t('booking.ticketTypeLabel')}
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-navy-950/80 rounded-xl border border-white/[0.05]">
                  <button
                    type="button"
                    onClick={() => setTicketType('SINGLE')}
                    disabled={step !== 'CONFIG'}
                    className={`py-1.5 px-3 rounded-lg text-xs font-mono font-bold transition-all ${
                      ticketType === 'SINGLE'
                        ? 'bg-blue-600 text-white shadow-glow-blue'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('booking.singleOption')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTicketType('RETURN')}
                    disabled={step !== 'CONFIG'}
                    className={`py-1.5 px-3 rounded-lg text-xs font-mono font-bold transition-all ${
                      ticketType === 'RETURN'
                        ? 'bg-blue-600 text-white shadow-glow-blue'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t('booking.returnOption')}
                  </button>
                </div>
              </div>
            </div>

            {/* Payment Summary & Action Button */}
            <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between">
              <div>
                <span className="text-[10px] text-gray-400 font-mono block">Fare to Authorize</span>
                <p className="text-xl sm:text-2xl font-black font-display text-emerald-400">
                  ₹{fareCalculation.totalFare}{' '}
                  <span className="text-xs font-normal text-gray-400 font-sans">(Test)</span>
                </p>
                <span className="text-[10px] text-gray-500 font-mono">
                  {t('booking.baseRate')}: ₹{fareCalculation.baseFare}
                </span>
              </div>

              <button
                type="button"
                id="btn-confirm-demo-booking"
                onClick={handleProceedToPayment}
                disabled={!currentRoute || step !== 'CONFIG'}
                className="btn-primary py-3 px-6 rounded-2xl font-bold flex items-center gap-2 shadow-glow-cyan/20 disabled:opacity-40 disabled:pointer-events-none"
              >
                {step === 'CREATING_ORDER' ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creating Order…</span>
                  </>
                ) : step === 'AWAITING_PAYMENT' ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Checkout Active…</span>
                  </>
                ) : step === 'VERIFYING' ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying Signature…</span>
                  </>
                ) : (
                  <>
                    <span>Pay with Razorpay (Test)</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
