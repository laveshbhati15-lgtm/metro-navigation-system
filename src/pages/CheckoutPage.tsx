import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { metroGraph } from '@/core/graph/MetroGraph';
import { planRoutes } from '@/core/algorithm/routePlanner';
import type { Station, MetroRoute, LineCode } from '@/core/graph/types';
import type { TicketType, DemoTicket } from '@/features/tickets/types';
import { useTicketStore } from '@/features/tickets/ticketStore';
import { DemoTicketCard } from '@/features/tickets/DemoTicketCard';
import { useAuth } from '@/context/AuthContext';
import {
  type PlannerTheme,
  isValidPlannerTheme,
  DEFAULT_PLANNER_THEME,
  PLANNER_THEME_STORAGE_KEY,
} from '@/context/PlannerThemeContext';
import {
  loadRazorpayCheckoutScript,
  createPaymentOrder,
  verifyServerPayment,
  type CreateOrderResponse,
} from '@/services/paymentService';
import { getCheckoutSession } from '@/features/checkout/checkoutSession';
import { estimateFare, formatDuration } from '@/utils/formatters';
import { LINE_COLORS } from '@/utils/lineColors';
import { getStationDisplayName, getLocalizedLineName } from '@/i18n';
import { cn } from '@/utils/cn';
import './checkout.css';

type CheckoutStep =
  | 'CONFIG'
  | 'CREATING_ORDER'
  | 'AWAITING_PAYMENT'
  | 'VERIFYING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'CANCELLED';

type ErrorCategory =
  | 'GATEWAY_LOAD_ERROR'
  | 'SCRIPT_LOAD_ERROR'
  | 'API_ERROR'
  | 'PAYMENT_DECLINED'
  | 'GENERAL_ERROR';

export function CheckoutPage() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const saveVerifiedTicket = useTicketStore((s) => s.saveVerifiedTicket);

  // Retrieve parameters from URL search params or fallback to sessionStorage
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const typeParam = searchParams.get('type') as TicketType | null;
  const passengersParam = searchParams.get('passengers');
  const themeParam = searchParams.get('theme');

  const session = useMemo(() => getCheckoutSession(), []);

  // Resolve theme with strict validation and fallback hierarchy:
  // 1. Explicit theme query param from URL (captures theme when Book Ticket clicked)
  // 2. Session storage theme from booking handoff
  // 3. Persistent localStorage theme
  // 4. Fallback: DEFAULT_PLANNER_THEME ('dark-transit')
  const checkoutTheme: PlannerTheme = useMemo(() => {
    if (isValidPlannerTheme(themeParam)) {
      return themeParam;
    }
    if (session?.theme && isValidPlannerTheme(session.theme)) {
      return session.theme;
    }
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(PLANNER_THEME_STORAGE_KEY);
        if (isValidPlannerTheme(stored)) {
          return stored;
        }
      } catch {
        // Storage access error
      }
    }
    return DEFAULT_PLANNER_THEME;
  }, [themeParam, session?.theme]);

  const sourceId = fromParam || session?.sourceId || null;
  const destinationId = toParam || session?.destinationId || null;

  // Station entities from verified graph
  const source: Station | null = useMemo(
    () => (sourceId ? metroGraph.getStation(sourceId) || null : null),
    [sourceId]
  );
  const destination: Station | null = useMemo(
    () => (destinationId ? metroGraph.getStation(destinationId) || null : null),
    [destinationId]
  );

  // Form State
  const [passengerCount, setPassengerCount] = useState<number>(() => {
    const p = passengersParam ? parseInt(passengersParam, 10) : session?.passengerCount;
    return p && p >= 1 && p <= 6 ? p : 1;
  });

  const [ticketType, setTicketType] = useState<TicketType>(() => {
    if (typeParam === 'SINGLE' || typeParam === 'RETURN') return typeParam;
    if (session?.ticketType === 'SINGLE' || session?.ticketType === 'RETURN') {
      return session.ticketType;
    }
    return 'SINGLE';
  });

  // Flow & Payment Execution State
  const [step, setStep] = useState<CheckoutStep>('CONFIG');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string>('Payment Failed or Denied');
  const [errorCategory, setErrorCategory] = useState<ErrorCategory>('GENERAL_ERROR');
  const [confirmedTicket, setConfirmedTicket] = useState<DemoTicket | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Active server-side order cache to prevent duplicate order generation on retry
  const activeOrderRef = useRef<{
    orderData: CreateOrderResponse;
    paramsKey: string;
  } | null>(null);

  const handlePassengerCountChange = (count: number) => {
    setPassengerCount(count);
    activeOrderRef.current = null;
    if (step === 'FAILED' || step === 'CANCELLED') {
      setStep('CONFIG');
      setErrorMessage(null);
    }
  };

  const handleTicketTypeChange = (type: TicketType) => {
    setTicketType(type);
    activeOrderRef.current = null;
    if (step === 'FAILED' || step === 'CANCELLED') {
      setStep('CONFIG');
      setErrorMessage(null);
    }
  };

  // Pre-load Razorpay checkout SDK
  useEffect(() => {
    loadRazorpayCheckoutScript().catch(() => {});
  }, []);

  // Compute live authentic transit route
  const route: MetroRoute | null = useMemo(() => {
    if (!source || !destination || source.id === destination.id) return null;
    const routes = planRoutes(metroGraph, source.id, destination.id);
    return routes[0] ?? null;
  }, [source, destination]);

  // Client preview fare calculation (authoritative calculated by backend on order creation)
  const farePreview = useMemo(() => {
    if (!route) return { baseFare: 0, subtotal: 0, multiplier: 1, total: 0 };
    const base = estimateFare(route.totalStations).amount;
    const mult = ticketType === 'RETURN' ? 1.8 : 1;
    const sub = base * passengerCount;
    const tot = Math.round(base * passengerCount * mult);
    return {
      baseFare: base,
      subtotal: sub,
      multiplier: mult,
      total: tot,
    };
  }, [route, passengerCount, ticketType]);

  // Primary payment authorization handler
  const handleProceedToPayment = useCallback(async () => {
    if (!source || !destination || !route || isSubmitting) return;

    setIsSubmitting(true);
    setStep('CREATING_ORDER');
    setErrorMessage(null);

    try {
      // 1. Ensure Razorpay Checkout script is loaded
      const isScriptLoaded = await loadRazorpayCheckoutScript();
      if (!isScriptLoaded || typeof window.Razorpay === 'undefined') {
        const scriptErr: any = new Error(
          'Razorpay Checkout script could not be loaded from checkout.razorpay.com. Please check your internet connection or ad-blocker.'
        );
        scriptErr.isScriptLoadError = true;
        throw scriptErr;
      }

      // 2. Obtain optional user ID token
      let idToken: string | undefined;
      if (user) {
        try {
          idToken = await user.getIdToken();
        } catch {
          // Fallback to guest order
        }
      }

      // 3. Request server-side order creation or reuse existing valid order to prevent duplicate orders
      const currentParamsKey = `${source.id}:${destination.id}:${passengerCount}:${ticketType}`;
      let orderData: CreateOrderResponse;

      if (
        activeOrderRef.current &&
        activeOrderRef.current.paramsKey === currentParamsKey
      ) {
        orderData = activeOrderRef.current.orderData;
      } else {
        orderData = await createPaymentOrder({
          sourceId: source.id,
          destinationId: destination.id,
          passengerCount,
          ticketType,
          idToken,
        });
        activeOrderRef.current = {
          orderData,
          paramsKey: currentParamsKey,
        };
      }

      setStep('AWAITING_PAYMENT');

      // 4. Configure Razorpay Standard Checkout in TEST MODE
      const razorpayOptions = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Delhi Metro Navigator · MetroPay',
        description: `${ticketType === 'RETURN' ? 'Return' : 'Single'} Transit Pass (${passengerCount} Passenger${passengerCount > 1 ? 's' : ''}) · Test Mode`,
        order_id: orderData.orderId,
        prefill: {
          name: user?.displayName || 'Delhi Commuter',
          email: user?.email || '',
        },
        theme: {
          color: '#10b981', // MetroPay Emerald
        },
        modal: {
          backdropclose: false,
          escape: false,
          handleback: true,
          ondismiss: () => {
            setIsSubmitting(false);
            setStep('CANCELLED');
            setErrorCategory('GENERAL_ERROR');
            setErrorMessage('Payment was dismissed or cancelled by the passenger.');
          },
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          setStep('VERIFYING');

          try {
            // 5. Submit cryptographic HMAC SHA256 signature to server for verification & capture confirmation
            const verifyResult = await verifyServerPayment({
              bookingId: orderData.bookingId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });

            if (verifyResult.success && verifyResult.ticket) {
              const linesUsed: LineCode[] = Array.from(
                new Set(route.edges.map((e) => e.line))
              );

              const newVerifiedTicket: DemoTicket = {
                id: verifyResult.ticket.id,
                createdAt: verifyResult.ticket.createdAt,
                expiresAt: verifyResult.ticket.expiresAt,
                source,
                destination,
                routeSummary: {
                  label: route.label,
                  totalTimeSeconds: route.totalTimeSeconds,
                  totalStations: route.totalStations,
                  interchangeCount: route.interchangeCount,
                  lines: linesUsed,
                  interchangeStations: route.interchanges.map((s) => s.name),
                },
                passengerCount: verifyResult.ticket.passengerCount || passengerCount,
                ticketType: verifyResult.ticket.ticketType || ticketType,
                baseFare: verifyResult.ticket.baseFare || farePreview.baseFare,
                totalFare: verifyResult.ticket.totalFare || farePreview.total,
                status: 'ACTIVE',
                paymentStatus: 'PAID',
                isVerifiedPayment: true,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                disclaimer: 'DEMO — NOT VALID FOR METRO TRAVEL',
                qrPayload: verifyResult.ticket.qrPayload,
              };

              activeOrderRef.current = null;
              saveVerifiedTicket(newVerifiedTicket);
              setConfirmedTicket(newVerifiedTicket);
              setStep('CONFIRMED');
            } else {
              throw new Error('Server payment verification did not return a valid confirmed ticket.');
            }
          } catch (verifyError: any) {
            console.error('Payment verification failed:', verifyError);
            setIsSubmitting(false);
            setStep('FAILED');
            setErrorCategory('GENERAL_ERROR');
            setErrorTitle('Payment Verification Failed');
            setErrorMessage(verifyError.message || 'Payment verification failed. No ticket was issued.');
          } finally {
            setIsSubmitting(false);
          }
        },
      };

      const razorpayInstance = new window.Razorpay(razorpayOptions);
      razorpayInstance.on('payment.failed', (failedResponse: any) => {
        console.warn('Razorpay payment failure event:', failedResponse);
        setIsSubmitting(false);
        setStep('FAILED');

        const desc = failedResponse.error?.description || '';
        const code = failedResponse.error?.code || '';
        const source = failedResponse.error?.source || '';
        const step = failedResponse.error?.step || '';

        const isGatewayLoadFailure =
          desc.toLowerCase().includes('load failed') ||
          desc.toLowerCase().includes('failed to load') ||
          (code === 'BAD_REQUEST_ERROR' && (!desc || desc === 'Load failed' || source === 'network' || step === 'payment_initiation'));

        if (isGatewayLoadFailure) {
          setErrorCategory('GATEWAY_LOAD_ERROR');
          setErrorTitle('Checkout Gateway Failed to Load');
          setErrorMessage(
            'The Razorpay checkout dialog could not connect to its servers. This commonly occurs when an ad-blocker, Safari content blocker, or privacy extension blocks checkout.razorpay.com or api.razorpay.com. Disable content blockers or check your network connection, then click Pay to retry.'
          );
        } else {
          setErrorCategory('PAYMENT_DECLINED');
          setErrorTitle('Payment Failed or Denied');
          setErrorMessage(
            desc || 'Payment failed or was declined by the test payment provider.'
          );
        }
      });

      razorpayInstance.open();
    } catch (orderError: any) {
      console.error('Order creation error:', orderError);
      setIsSubmitting(false);
      setStep('FAILED');

      const msg = orderError?.message || '';
      const isScriptFailure =
        orderError?.isScriptLoadError ||
        msg.includes('script could not be loaded');

      const isNetworkFailure =
        orderError?.isNetworkError ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('load failed') ||
        msg.toLowerCase().includes('failed to fetch');

      if (isScriptFailure) {
        setErrorCategory('SCRIPT_LOAD_ERROR');
        setErrorTitle('Payment Script Failed to Load');
        setErrorMessage(
          'Could not load the Razorpay checkout script from checkout.razorpay.com. Please check your internet connection or disable ad-blockers / privacy extensions, then retry.'
        );
      } else if (isNetworkFailure) {
        setErrorCategory('API_ERROR');
        setErrorTitle('Payment Server Connection Failed');
        setErrorMessage(
          'Could not connect to the payment server. If you are developing locally, ensure the API is running. On production, check your network connection or try again shortly.'
        );
      } else if (orderError?.code === 'CONFIG_MISSING') {
        setErrorCategory('API_ERROR');
        setErrorTitle('Razorpay Test Credentials Missing');
        setErrorMessage(
          'Razorpay Test Mode credentials (RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET) are not configured in the Vercel backend environment.'
        );
      } else if (orderError?.code === 'DATABASE_UNAVAILABLE') {
        setErrorCategory('API_ERROR');
        setErrorTitle('Database Configuration Missing');
        setErrorMessage(
          'Firebase service account credentials (FIREBASE_SERVICE_ACCOUNT_KEY) are not configured in the Vercel backend environment.'
        );
      } else {
        setErrorCategory('API_ERROR');
        setErrorTitle('Unable to Initialize Payment');
        setErrorMessage(
          msg || 'Failed to initialize payment order with server.'
        );
      }
    }
  }, [
    source,
    destination,
    route,
    isSubmitting,
    user,
    passengerCount,
    ticketType,
    farePreview,
    saveVerifiedTicket,
  ]);

  // Invalid parameters view
  if (!source || !destination || source.id === destination.id || !route) {
    return (
      <div
        data-page="checkout"
        data-checkout-theme={checkoutTheme}
        className="min-h-screen flex flex-col justify-between font-sans transition-colors duration-200"
      >
        {/* Header */}
        <header className="metropay-header backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <Link to="/planner" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-md font-bold">
                💳
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--mp-text-primary)] tracking-tight flex items-center gap-1.5">
                  <span>MetroPay</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">
                    TEST
                  </span>
                </p>
                <p className="text-[10px] text-[var(--mp-text-secondary)] font-mono">Transit Checkout Gateway</p>
              </div>
            </Link>

            <Link
              to="/planner"
              className="text-xs text-[var(--mp-back-btn-text)] px-3 py-1.5 rounded-lg border border-[var(--mp-back-btn-border)] bg-[var(--mp-back-btn-bg)] hover:bg-[var(--mp-back-btn-hover-bg)] transition-colors"
            >
              ← {t('nav.planner')}
            </Link>
          </div>
        </header>

        {/* Empty / Error Body */}
        <main className="max-w-md mx-auto px-4 py-16 text-center">
          <div className="metropay-card p-8">
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-xl mb-4">
              ⚠️
            </div>
            <h2 className="text-lg font-bold text-[var(--mp-text-primary)] mb-2">No Active Booking Session</h2>
            <p className="text-xs text-[var(--mp-text-secondary)] mb-6 leading-relaxed">
              Please choose valid origin and destination stations in the Delhi Metro Route Planner
              before proceeding to checkout.
            </p>
            <Link
              to="/planner"
              className="metropay-btn-primary inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold w-full"
            >
              <span>📍</span>
              <span>Go to Route Planner</span>
            </Link>
          </div>
        </main>

        {/* Footer */}
        <footer className="metropay-footer py-4 text-center text-[11px] font-mono">
          MetroPay · Simulated Transit Payment Portal · Razorpay Test Mode
        </footer>
      </div>
    );
  }

  const srcDisplay = getStationDisplayName(source, i18n.language);
  const dstDisplay = getStationDisplayName(destination, i18n.language);

  return (
    <div
      data-page="checkout"
      data-checkout-theme={checkoutTheme}
      className="min-h-screen flex flex-col justify-between font-sans selection:bg-emerald-500/30 transition-colors duration-200"
    >
      {/* ── 1. MetroPay Header ── */}
      <header className="metropay-header backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md text-base">
              💳
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold text-[var(--mp-text-primary)] tracking-tight">MetroPay</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold bg-[var(--mp-badge-bg)] text-[var(--mp-badge-text)] border border-[var(--mp-badge-border)]">
                  SECURE TEST GATEWAY
                </span>
              </div>
              <p className="text-[10px] text-[var(--mp-text-secondary)] font-mono">
                Official Transit Checkout · Delhi Metro Simulation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/planner')}
              className="text-xs text-[var(--mp-back-btn-text)] px-3 py-1.5 rounded-lg border border-[var(--mp-back-btn-border)] bg-[var(--mp-back-btn-bg)] hover:bg-[var(--mp-back-btn-hover-bg)] transition-colors flex items-center gap-1.5"
            >
              <span>←</span>
              <span>{t('nav.planner')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── 2. Prominent Demo Disclaimer Banner ── */}
      <div className="metropay-notice-banner py-2.5 px-4 text-center">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-2 text-xs font-mono">
          <span className="shrink-0">⚠️</span>
          <span>
            <strong>DEMO TICKET — NOT VALID FOR METRO TRAVEL.</strong> Test environment running via Razorpay Test Mode. Real payments will not be processed.
          </span>
        </div>
      </div>

      {/* ── 3. Main Checkout Container ── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-grow w-full">
        {step === 'CONFIRMED' && confirmedTicket ? (
          /* ── Success & Confirmed Ticket View ── */
          <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
            <div className="metropay-card p-5 border-emerald-500/40 bg-emerald-500/10 text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-2xl font-bold">
                ✓
              </div>
              <h2 className="text-lg font-bold text-[var(--mp-text-primary)]">Payment Verified & Ticket Issued!</h2>
              <p className="text-xs text-[var(--mp-text-secondary)]">
                Razorpay payment was independently captured and cryptographically confirmed by the server.
              </p>
            </div>

            {/* Render verified demo ticket */}
            <DemoTicketCard ticket={confirmedTicket} />

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/planner')}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-[var(--mp-border)] bg-[var(--mp-surface)] hover:bg-[var(--mp-surface-hover)] text-xs font-semibold text-[var(--mp-text-primary)] transition-colors flex items-center justify-center gap-2"
              >
                <span>📍</span>
                <span>Plan Another Journey</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/tickets')}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl metropay-btn-primary text-xs font-semibold transition-all flex items-center justify-center gap-2"
              >
                <span>🎟️</span>
                <span>View All Demo Tickets</span>
              </button>
            </div>
          </div>
        ) : (
          /* ── Standard Checkout Form & Order Summary ── */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* Left Column: Journey Details & Ticket Config */}
            <div className="lg:col-span-7 space-y-5">
              {/* Journey Itinerary Card */}
              <div className="metropay-card p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--mp-border-subtle)]">
                  <div>
                    <h2 className="text-sm font-bold text-[var(--mp-text-primary)] uppercase tracking-wider font-mono">
                      Journey Itinerary
                    </h2>
                    <p className="text-xs text-[var(--mp-text-secondary)]">Delhi Rapid Transit Corridor</p>
                  </div>
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/30">
                    {route.label}
                  </span>
                </div>

                {/* Stations Chain */}
                <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-emerald-500 before:via-blue-500 before:to-red-500">
                  {/* Origin */}
                  <div className="relative">
                    <span className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-[var(--mp-surface)]" />
                    <p className="text-[10px] text-emerald-500 font-mono uppercase tracking-wider font-semibold">Origin Station</p>
                    <p className="text-sm font-bold text-[var(--mp-text-primary)]">{srcDisplay}</p>
                  </div>

                  {/* Lines used in transit */}
                  <div className="py-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {route.lineSegments.map((seg, sIdx) => (
                        <span
                          key={sIdx}
                          className="text-[10px] font-mono px-2 py-0.5 rounded text-white font-medium flex items-center gap-1 shadow-xs"
                          style={{ backgroundColor: LINE_COLORS[seg.line] }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
                          <span>{getLocalizedLineName(seg.line, i18n.language)}</span>
                          <span className="opacity-80 font-normal">({seg.stations.length - 1} stops)</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Destination */}
                  <div className="relative">
                    <span className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-red-500 ring-4 ring-[var(--mp-surface)]" />
                    <p className="text-[10px] text-red-500 font-mono uppercase tracking-wider font-semibold">Destination Station</p>
                    <p className="text-sm font-bold text-[var(--mp-text-primary)]">{dstDisplay}</p>
                  </div>
                </div>

                {/* Journey Metrics Bar */}
                <div className="pt-3 border-t border-[var(--mp-border-subtle)] grid grid-cols-3 gap-2 text-center text-xs font-mono">
                  <div className="metropay-stat-box p-2 rounded-lg">
                    <p className="text-[10px] text-[var(--mp-text-muted)]">STATIONS</p>
                    <p className="text-[var(--mp-text-primary)] font-bold">{route.totalStations}</p>
                  </div>
                  <div className="metropay-stat-box p-2 rounded-lg">
                    <p className="text-[10px] text-[var(--mp-text-muted)]">EST. TIME</p>
                    <p className="text-[var(--mp-text-primary)] font-bold">{formatDuration(route.totalTimeSeconds)}</p>
                  </div>
                  <div className="metropay-stat-box p-2 rounded-lg">
                    <p className="text-[10px] text-[var(--mp-text-muted)]">TRANSFERS</p>
                    <p className="text-[var(--mp-text-primary)] font-bold">{route.interchangeCount}</p>
                  </div>
                </div>
              </div>

              {/* Ticket Customization Card */}
              <div className="metropay-card p-5 sm:p-6 space-y-4">
                <h3 className="text-xs font-bold text-[var(--mp-text-primary)] uppercase tracking-wider font-mono pb-2 border-b border-[var(--mp-border-subtle)]">
                  Ticket Configuration
                </h3>

                {/* Ticket Type Selector */}
                <div>
                  <label className="text-xs font-medium text-[var(--mp-text-secondary)] mb-2 block">
                    Journey Type
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      id="opt-ticket-single"
                      onClick={() => handleTicketTypeChange('SINGLE')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        ticketType === 'SINGLE'
                          ? 'border-[var(--mp-option-active-border)] bg-[var(--mp-option-active-bg)] text-[var(--mp-option-active-text)]'
                          : 'border-[var(--mp-border)] bg-[var(--mp-surface-subtle)] text-[var(--mp-text-secondary)] hover:border-[var(--mp-border-highlight)]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold">Single Journey</span>
                        {ticketType === 'SINGLE' && <span className="text-emerald-500 text-xs">●</span>}
                      </div>
                      <p className="text-[11px] opacity-80">One-way transit pass</p>
                    </button>

                    <button
                      type="button"
                      id="opt-ticket-return"
                      onClick={() => handleTicketTypeChange('RETURN')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        ticketType === 'RETURN'
                          ? 'border-[var(--mp-option-active-border)] bg-[var(--mp-option-active-bg)] text-[var(--mp-option-active-text)]'
                          : 'border-[var(--mp-border)] bg-[var(--mp-surface-subtle)] text-[var(--mp-text-secondary)] hover:border-[var(--mp-border-highlight)]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold">Return Journey</span>
                        {ticketType === 'RETURN' && <span className="text-emerald-500 text-xs">●</span>}
                      </div>
                      <p className="text-[11px] opacity-80">Two-way pass (10% return discount)</p>
                    </button>
                  </div>
                </div>

                {/* Passenger Count Stepper */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-[var(--mp-text-secondary)]">
                      Passengers
                    </label>
                    <span className="text-xs font-mono text-emerald-500">
                      Max 6 passengers
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                      <button
                        key={num}
                        type="button"
                        id={`btn-passengers-${num}`}
                        onClick={() => handlePassengerCountChange(num)}
                        className={`flex-1 py-2 rounded-lg text-xs font-mono font-semibold transition-all border ${
                          passengerCount === num
                            ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                            : 'bg-[var(--mp-surface-subtle)] text-[var(--mp-text-secondary)] border-[var(--mp-border)] hover:bg-[var(--mp-surface-hover)]'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Security & Assurance Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-[var(--mp-text-secondary)] font-mono">
                <div className="p-2.5 rounded-lg bg-[var(--mp-surface)] border border-[var(--mp-border)] flex items-center gap-2">
                  <span className="text-emerald-500">🔒</span>
                  <span>256-Bit SSL Secured</span>
                </div>
                <div className="p-2.5 rounded-lg bg-[var(--mp-surface)] border border-[var(--mp-border)] flex items-center gap-2">
                  <span className="text-cyan-500">⚡</span>
                  <span>Instant Demo Pass</span>
                </div>
                <div className="p-2.5 rounded-lg bg-[var(--mp-surface)] border border-[var(--mp-border)] flex items-center gap-2">
                  <span className="text-amber-500">🛡️</span>
                  <span>Razorpay Test Mode</span>
                </div>
              </div>
            </div>

            {/* Right Column: Order Summary & Checkout Action */}
            <div className="lg:col-span-5 space-y-4">
              <div className="metropay-card p-5 sm:p-6 space-y-5 sticky top-24">
                <div className="pb-3 border-b border-[var(--mp-border-subtle)]">
                  <h3 className="text-sm font-bold text-[var(--mp-text-primary)] uppercase tracking-wider font-mono">
                    Payment Breakdown
                  </h3>
                  <p className="text-xs text-[var(--mp-text-secondary)]">Official DMRC Fare Schedule</p>
                </div>

                {/* Line Item Breakdown */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between text-[var(--mp-text-secondary)]">
                    <span>Base Transit Fare (per passenger)</span>
                    <span className="font-mono font-medium text-[var(--mp-text-primary)]">₹{farePreview.baseFare}</span>
                  </div>

                  <div className="flex items-center justify-between text-[var(--mp-text-secondary)]">
                    <span>Number of Passengers</span>
                    <span className="font-mono font-medium text-[var(--mp-text-primary)]">× {passengerCount}</span>
                  </div>

                  {ticketType === 'RETURN' && (
                    <div className="flex items-center justify-between text-emerald-500 font-medium">
                      <span>Return Multiplier (10% return discount)</span>
                      <span className="font-mono">× 1.8</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[var(--mp-text-muted)]">
                    <span>Booking Fee & Taxes</span>
                    <span className="font-mono text-emerald-500 font-medium">₹0.00 (Waived)</span>
                  </div>

                  <div className="pt-3 border-t border-[var(--mp-border-subtle)] flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-[var(--mp-text-primary)] uppercase font-mono">Total Demo Fare</p>
                      <p className="text-[10px] text-[var(--mp-text-muted)] font-mono">Inclusive of all transit surcharges</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-extrabold text-emerald-500 font-mono">
                        ₹{farePreview.total}
                      </p>
                      <p className="text-[10px] text-[var(--mp-text-muted)] font-mono">INR (TEST MODE)</p>
                    </div>
                  </div>
                </div>

                {/* Error Banner */}
                {step === 'FAILED' && errorMessage && (
                  <div
                    role="alert"
                    className={cn(
                      'p-3.5 rounded-xl border text-xs space-y-1.5 transition-all',
                      errorCategory === 'GATEWAY_LOAD_ERROR' || errorCategory === 'SCRIPT_LOAD_ERROR'
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                        : 'bg-red-500/10 border-red-500/40 text-red-400'
                    )}
                  >
                    <p className="font-bold flex items-center gap-1.5 text-sm">
                      <span>{errorCategory === 'GATEWAY_LOAD_ERROR' || errorCategory === 'SCRIPT_LOAD_ERROR' ? '⚠️' : '✕'}</span>
                      <span>{errorTitle}</span>
                    </p>
                    <p className="text-[11px] leading-relaxed font-sans opacity-95">
                      {errorMessage}
                    </p>
                    {(errorCategory === 'GATEWAY_LOAD_ERROR' || errorCategory === 'SCRIPT_LOAD_ERROR') && (
                      <p className="text-[10px] font-mono text-[var(--mp-text-muted)] pt-1 border-t border-amber-500/20">
                        Tip: In Safari or Brave, turn off "Prevent cross-site tracking" or ad-blockers for checkout, then retry.
                      </p>
                    )}
                  </div>
                )}

                {/* Cancelled Banner */}
                {step === 'CANCELLED' && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-500 text-xs space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <span>ℹ</span>
                      <span>Payment Cancelled</span>
                    </p>
                    <p className="text-[11px] leading-relaxed font-mono">
                      {errorMessage || 'You dismissed the payment dialog. Your order was not charged.'}
                    </p>
                  </div>
                )}

                {/* Action Trigger */}
                <div className="space-y-3 pt-2">
                  <button
                    type="button"
                    id="btn-proceed-metropay"
                    disabled={isSubmitting || step === 'CREATING_ORDER' || step === 'VERIFYING'}
                    onClick={handleProceedToPayment}
                    className="w-full py-3.5 px-4 rounded-xl metropay-btn-primary font-bold text-sm tracking-wide flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                  >
                    {step === 'CREATING_ORDER' ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Creating Order...</span>
                      </>
                    ) : step === 'AWAITING_PAYMENT' ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Awaiting Authorization...</span>
                      </>
                    ) : step === 'VERIFYING' ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Verifying Capture...</span>
                      </>
                    ) : (
                      <>
                        <span>🔒</span>
                        <span>Pay ₹{farePreview.total} with Razorpay</span>
                      </>
                    )}
                  </button>

                  <p className="text-[10px] text-center text-[var(--mp-text-muted)] font-mono leading-tight">
                    By clicking Pay, you open Razorpay Test Mode checkout. No real currency is charged.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── 4. MetroPay Footer ── */}
      <footer className="metropay-footer py-5 text-center text-xs font-mono space-y-1">
        <p>MetroPay Transit Checkout · Delhi Metro Navigation System</p>
        <p className="text-[10px] opacity-75">
          Simulated educational pass · Fully decoupled from DMRC automatic fare collection gates
        </p>
      </footer>
    </div>
  );
}
