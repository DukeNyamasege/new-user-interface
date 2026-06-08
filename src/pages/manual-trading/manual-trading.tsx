import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { getLastDigitFromQuote, isExpectedStreamInterruption } from '@/utils/market-data';
import { buyContractForUi, streamContractUntilSettled } from '@/utils/trade-purchase';
import { safeSubscribe } from '@/utils/websocket-handler';

type TManualMarket = {
    label: string;
    symbol: string;
};

type TTickPoint = {
    epoch: number;
    quote: number;
};

type TDigitStat = {
    count: number;
    digit: number;
    percent: number;
};

type TDigitTradeGroup = 'even_odd' | 'over_under' | 'matches_differs';

type TManualTradeAction = {
    contractType: 'DIGITEVEN' | 'DIGITODD' | 'DIGITOVER' | 'DIGITUNDER' | 'DIGITMATCH' | 'DIGITDIFF';
    label: string;
    tone: 'blue' | 'red' | 'teal' | 'slate';
};

const DEFAULT_TICK_COUNT = 1000;
const MIN_TICK_COUNT = 10;
const MAX_TICK_COUNT = 1000;
const DEFAULT_STAKE = '1';
const DEFAULT_DURATION = '1';

const MANUAL_MARKETS: TManualMarket[] = [
    { label: 'Volatility 10 (1s) Index', symbol: '1HZ10V' },
    { label: 'Volatility 15 (1s) Index', symbol: '1HZ15V' },
    { label: 'Volatility 25 (1s) Index', symbol: '1HZ25V' },
    { label: 'Volatility 30 (1s) Index', symbol: '1HZ30V' },
    { label: 'Volatility 50 (1s) Index', symbol: '1HZ50V' },
    { label: 'Volatility 75 (1s) Index', symbol: '1HZ75V' },
    { label: 'Volatility 90 (1s) Index', symbol: '1HZ90V' },
    { label: 'Volatility 100 (1s) Index', symbol: '1HZ100V' },
    { label: 'Volatility 10 Index', symbol: 'R_10' },
    { label: 'Volatility 25 Index', symbol: 'R_25' },
    { label: 'Volatility 50 Index', symbol: 'R_50' },
    { label: 'Volatility 75 Index', symbol: 'R_75' },
    { label: 'Volatility 100 Index', symbol: 'R_100' },
];

const TRADE_GROUPS: { label: string; value: TDigitTradeGroup }[] = [
    { label: 'Even / Odd', value: 'even_odd' },
    { label: 'Over / Under', value: 'over_under' },
    { label: 'Matches / Differs', value: 'matches_differs' },
];

const TRADE_ACTIONS: Record<TDigitTradeGroup, TManualTradeAction[]> = {
    even_odd: [
        { contractType: 'DIGITEVEN', label: 'Even', tone: 'teal' },
        { contractType: 'DIGITODD', label: 'Odd', tone: 'red' },
    ],
    over_under: [
        { contractType: 'DIGITOVER', label: 'Over', tone: 'teal' },
        { contractType: 'DIGITUNDER', label: 'Under', tone: 'red' },
    ],
    matches_differs: [
        { contractType: 'DIGITMATCH', label: 'Matches', tone: 'blue' },
        { contractType: 'DIGITDIFF', label: 'Differs', tone: 'slate' },
    ],
};

const BARRIER_TRADE_GROUPS = new Set<TDigitTradeGroup>(['over_under', 'matches_differs']);

const RING_COLORS = {
    highest: '#0ba95b',
    secondHighest: '#1127ff',
    least: '#ff1717',
    secondLeast: '#ffe733',
    neutral: '#666666',
};

const clampTickCount = (value: number) => {
    if (!Number.isFinite(value)) return DEFAULT_TICK_COUNT;

    return Math.min(MAX_TICK_COUNT, Math.max(MIN_TICK_COUNT, Math.round(value)));
};

const clampDuration = (value: number) => {
    if (!Number.isFinite(value)) return 1;

    return Math.min(10, Math.max(1, Math.round(value)));
};

const createEmptyStats = (): TDigitStat[] =>
    Array.from({ length: 10 }, (_, digit) => ({
        count: 0,
        digit,
        percent: 0,
    }));

const calculateDigitStats = (ticks: TTickPoint[], symbol: string): TDigitStat[] => {
    const counts = new Array(10).fill(0);

    ticks.forEach(tick => {
        counts[getLastDigitFromQuote(tick.quote, symbol)] += 1;
    });

    return counts.map((count, digit) => ({
        count,
        digit,
        percent: ticks.length ? Math.round((count / ticks.length) * 10000) / 100 : 0,
    }));
};

const getSpecialDigitColorMap = (stats: TDigitStat[], hasTicks: boolean) => {
    if (!hasTicks) return {};

    const colorMap: Record<number, string> = {};
    const descending = [...stats].sort((a, b) => b.percent - a.percent || b.digit - a.digit);
    const ascending = [...stats].sort((a, b) => a.percent - b.percent || a.digit - b.digit);

    colorMap[descending[0].digit] = RING_COLORS.highest;
    colorMap[descending[1].digit] = RING_COLORS.secondHighest;
    colorMap[ascending[0].digit] = RING_COLORS.least;
    colorMap[ascending[1].digit] = RING_COLORS.secondLeast;

    return colorMap;
};

const getQuoteFromTick = (data: any): TTickPoint | null => {
    const quote = Number(data?.tick?.quote);
    if (!Number.isFinite(quote)) return null;

    return {
        epoch: Number(data?.tick?.epoch) || Math.floor(Date.now() / 1000),
        quote,
    };
};

const formatPayout = (value: unknown, currency: string) => {
    const payout = Number(value);
    if (!Number.isFinite(payout)) return '';

    return `${payout.toFixed(2)} ${currency}`;
};

const ManualTrading = observer(() => {
    const { client, dashboard, run_panel, summary_card, transactions, ui } = useStore();
    const { active_tab } = dashboard;
    const [selectedSymbol, setSelectedSymbol] = useState(MANUAL_MARKETS[0].symbol);
    const [tickCountInput, setTickCountInput] = useState(String(DEFAULT_TICK_COUNT));
    const [activeTickCount, setActiveTickCount] = useState(DEFAULT_TICK_COUNT);
    const [ticks, setTicks] = useState<TTickPoint[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLive, setIsLive] = useState(false);
    const [tradeGroup, setTradeGroup] = useState<TDigitTradeGroup>('even_odd');
    const [selectedBarrier, setSelectedBarrier] = useState('2');
    const [durationInput, setDurationInput] = useState(DEFAULT_DURATION);
    const [stakeInput, setStakeInput] = useState(DEFAULT_STAKE);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [tradeMessage, setTradeMessage] = useState('');
    const [tradeError, setTradeError] = useState('');
    const [proposalPayouts, setProposalPayouts] = useState<Record<string, string>>({});
    const subscriptionRef = useRef<{ unsubscribe?: () => void } | null>(null);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const requestVersionRef = useRef(0);
    const proposalVersionRef = useRef(0);

    const showManualTrading = active_tab === DBOT_TABS.MANUAL_TRADING;
    const selectedMarket = MANUAL_MARKETS.find(market => market.symbol === selectedSymbol) ?? MANUAL_MARKETS[0];
    const latestTick = ticks[ticks.length - 1] ?? null;
    const latestDigit = latestTick ? getLastDigitFromQuote(latestTick.quote, selectedSymbol) : null;
    const digitStats = useMemo(() => calculateDigitStats(ticks, selectedSymbol), [selectedSymbol, ticks]);
    const specialDigitColorMap = useMemo(() => getSpecialDigitColorMap(digitStats, ticks.length > 0), [digitStats, ticks.length]);
    const needsBarrier = BARRIER_TRADE_GROUPS.has(tradeGroup);
    const activeActions = TRADE_ACTIONS[tradeGroup];
    const currency = client.currency || 'USD';

    const clearRetryTimer = useCallback(() => {
        if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
    }, []);

    const unsubscribe = useCallback(() => {
        try {
            subscriptionRef.current?.unsubscribe?.();
        } catch {
            // The safe subscriber already reports unsubscribe errors.
        }
        subscriptionRef.current = null;
        setIsLive(false);
    }, []);

    const applyTick = useCallback(
        (tick: TTickPoint) => {
            setTicks(previous_ticks => [...previous_ticks, tick].slice(-activeTickCount));
            setIsLive(true);
            setError(null);
        },
        [activeTickCount]
    );

    const loadMarketData = useCallback(async () => {
        clearRetryTimer();
        unsubscribe();

        if (!showManualTrading) return;

        const requestVersion = requestVersionRef.current + 1;
        requestVersionRef.current = requestVersion;
        setTicks([]);

        if (!api_base.api) {
            setIsLoading(true);
            setError('Connecting to Deriv market data...');
            retryTimerRef.current = setTimeout(() => {
                void loadMarketData();
            }, 1000);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await (api_base.api as any).send({
                ticks_history: selectedSymbol,
                end: 'latest',
                count: activeTickCount,
                style: 'ticks',
            });
            if (requestVersionRef.current !== requestVersion) return;

            const prices = Array.isArray(response?.history?.prices) ? response.history.prices : [];
            const times = Array.isArray(response?.history?.times) ? response.history.times : [];
            const historyTicks = prices
                .map((price: unknown, index: number) => ({
                    epoch: Number(times[index]) || Math.floor(Date.now() / 1000),
                    quote: Number(price),
                }))
                .filter((tick: TTickPoint) => Number.isFinite(tick.quote))
                .slice(-activeTickCount);

            setTicks(historyTicks);

            const tickObservable = (api_base.api as any).subscribe({ ticks: selectedSymbol });
            subscriptionRef.current = safeSubscribe(
                tickObservable,
                (data: any) => {
                    if (requestVersionRef.current !== requestVersion) return;

                    if (data?.error) {
                        if (!isExpectedStreamInterruption(data.error)) {
                            setError(data.error.message || 'Deriv tick stream error.');
                        }
                        return;
                    }

                    const tick = getQuoteFromTick(data);
                    if (tick) applyTick(tick);
                },
                streamError => {
                    if (requestVersionRef.current !== requestVersion) return;

                    if (!isExpectedStreamInterruption(streamError)) {
                        setError('Deriv tick stream interrupted. Reconnecting...');
                    }
                    setIsLive(false);
                }
            );
            setIsLive(true);
        } catch (loadError) {
            if (requestVersionRef.current !== requestVersion) return;

            setError(loadError instanceof Error ? loadError.message : 'Unable to load Deriv market data.');
            setIsLive(false);
        } finally {
            if (requestVersionRef.current === requestVersion) {
                setIsLoading(false);
            }
        }
    }, [activeTickCount, applyTick, clearRetryTimer, selectedSymbol, showManualTrading, unsubscribe]);

    useEffect(() => {
        if (!showManualTrading) {
            clearRetryTimer();
            unsubscribe();
            return undefined;
        }

        void loadMarketData();

        return () => {
            clearRetryTimer();
            unsubscribe();
        };
    }, [clearRetryTimer, loadMarketData, showManualTrading, unsubscribe]);

    const buildTradeParameters = useCallback(
        (contractType: TManualTradeAction['contractType']) => {
            const stake = Number(stakeInput);
            const duration = clampDuration(Number(durationInput));
            const parameters: Record<string, number | string> = {
                amount: stake,
                basis: 'stake',
                contract_type: contractType,
                currency,
                duration,
                duration_unit: 't',
                symbol: selectedSymbol,
            };

            if (needsBarrier) parameters.barrier = selectedBarrier;

            return parameters;
        },
        [currency, durationInput, needsBarrier, selectedBarrier, selectedSymbol, stakeInput]
    );

    const pushContract = useCallback(
        (data: any) => {
            try {
                transactions.pushTransaction({ ...data, run_id: run_panel.run_id });
                run_panel.onBotContractEvent(data);
                summary_card.onBotContractEvent(data);
            } catch {
                // Manual trading should not fail because a side panel observer is unavailable.
            }
        },
        [run_panel, summary_card, transactions]
    );

    useEffect(() => {
        const proposalVersion = proposalVersionRef.current + 1;
        proposalVersionRef.current = proposalVersion;
        setProposalPayouts({});

        const stake = Number(stakeInput);
        if (!showManualTrading || !api_base.api || !Number.isFinite(stake) || stake <= 0) return undefined;

        const loadProposals = async () => {
            const nextPayouts: Record<string, string> = {};

            await Promise.all(
                activeActions.map(async action => {
                    try {
                        const proposalResponse = await (api_base.api as any).send({
                            proposal: 1,
                            subscribe: 0,
                            ...buildTradeParameters(action.contractType),
                        });
                        const payout = formatPayout(proposalResponse?.proposal?.payout, currency);
                        if (payout) nextPayouts[action.contractType] = payout;
                    } catch {
                        // Proposal previews are optional; the buy button still validates on purchase.
                    }
                })
            );

            if (proposalVersionRef.current === proposalVersion) {
                setProposalPayouts(nextPayouts);
            }
        };

        void loadProposals();

        return undefined;
    }, [activeActions, buildTradeParameters, currency, showManualTrading, stakeInput]);

    const handleApplyTicks = () => {
        const nextTickCount = clampTickCount(Number(tickCountInput));
        setTickCountInput(String(nextTickCount));
        setActiveTickCount(nextTickCount);
    };

    const handleMarketChange = (symbol: string) => {
        setSelectedSymbol(symbol);
        setTicks([]);
        setError(null);
        setIsLoading(true);
    };

    const handleTickCountChange = (value: string) => {
        setTickCountInput(value.replace(/[^\d]/g, ''));
    };

    const handleDurationChange = (value: string) => {
        setDurationInput(value.replace(/[^\d]/g, ''));
    };

    const handleDurationBlur = () => {
        setDurationInput(String(clampDuration(Number(durationInput))));
    };

    const handleStakeChange = (value: string) => {
        const cleaned = value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
        setStakeInput(cleaned);
    };

    const handleManualPurchase = async (action: TManualTradeAction) => {
        const stake = Number(stakeInput);
        if (!Number.isFinite(stake) || stake <= 0) {
            setTradeError('Enter a valid stake before buying a contract.');
            return;
        }

        if (!api_base.api) {
            setTradeError('Deriv connection is not ready yet.');
            return;
        }

        setTradeError('');
        setTradeMessage(`Buying ${action.label} contract...`);
        setIsPurchasing(true);

        const tradeStartTime = Math.floor(Date.now() / 1000);
        const verificationId = `manual_${selectedSymbol}_${tradeStartTime}_${Math.random().toString(36).slice(2, 11)}`;
        const parameters = buildTradeParameters(action.contractType);
        const fallbackContract = {
            buy_price: stake,
            date_start: tradeStartTime,
            display_name: selectedMarket.label,
            underlying_symbol: selectedSymbol,
            shortcode: `MANUAL_${action.contractType}_${selectedSymbol}`,
            contract_type: action.contractType,
            currency,
            verification_id: verificationId,
        };

        try {
            const buy = await buyContractForUi({ parameters, price: stake, source: 'ManualTrading' });
            const buySnapshot = {
                ...fallbackContract,
                buy_price: buy.buy_price,
                contract_id: buy.contract_id,
                transaction_ids: { buy: buy.transaction_id },
            };

            pushContract(buySnapshot);

            const settledContract = await streamContractUntilSettled({
                contractId: buy.contract_id,
                fallback: buySnapshot,
                onUpdate: snapshot => pushContract(snapshot),
                source: 'ManualTrading',
            });
            const profit = Number(settledContract.profit ?? 0);
            setTradeMessage(
                `${action.label} contract closed ${profit >= 0 ? 'with profit' : 'with loss'}: ${profit.toFixed(2)} ${currency}`
            );
        } catch (purchaseError) {
            setTradeMessage('');
            setTradeError(
                purchaseError instanceof Error ? purchaseError.message : 'Manual Trading could not purchase this contract.'
            );
        } finally {
            setIsPurchasing(false);
        }
    };

    if (!showManualTrading) return null;

    return (
        <div
            className={classNames('manual-trading-page', {
                'manual-trading-page--dark': ui.is_dark_mode_on,
            })}
        >
            <section className='manual-trading-toolbar'>
                <label className='manual-trading-field manual-trading-field--market'>
                    <span>Market</span>
                    <select
                        aria-label='Market'
                        className='manual-trading-field__control'
                        value={selectedSymbol}
                        onChange={event => handleMarketChange(event.target.value)}
                    >
                        {MANUAL_MARKETS.map(market => (
                            <option key={market.symbol} value={market.symbol}>
                                {market.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className='manual-trading-field'>
                    <span>Analysis ticks</span>
                    <input
                        aria-label='Analysis ticks'
                        className='manual-trading-field__control'
                        inputMode='numeric'
                        max={MAX_TICK_COUNT}
                        min={MIN_TICK_COUNT}
                        value={tickCountInput}
                        onBlur={handleApplyTicks}
                        onChange={event => handleTickCountChange(event.target.value)}
                    />
                </label>
                <button className='manual-trading-toolbar__apply' type='button' onClick={handleApplyTicks}>
                    Apply
                </button>
                <span
                    className={classNames('manual-trading-toolbar__status', {
                        'manual-trading-toolbar__status--live': isLive && !isLoading,
                    })}
                >
                    {isLoading ? 'Loading' : isLive ? 'LIVE' : 'Waiting'}
                </span>
            </section>

            {error && <div className='manual-trading-page__error'>{error}</div>}

            <section className='manual-trading-digits-card'>
                <div className='manual-trading-digits-grid'>
                    {(digitStats.length ? digitStats : createEmptyStats()).map(stat => {
                        const ringColor = specialDigitColorMap[stat.digit] ?? RING_COLORS.neutral;

                        return (
                            <div
                                className={classNames('manual-trading-digit', {
                                    'manual-trading-digit--active': stat.digit === latestDigit,
                                    'manual-trading-digit--special': Boolean(specialDigitColorMap[stat.digit]),
                                })}
                                key={stat.digit}
                            >
                                <div
                                    className='manual-trading-digit__circle'
                                    style={{ '--ring-color': ringColor } as CSSProperties}
                                >
                                    <div className='manual-trading-digit__inner'>
                                        <span className='manual-trading-digit__number'>{stat.digit}</span>
                                        <span className='manual-trading-digit__percent'>{stat.percent.toFixed(2)}%</span>
                                    </div>
                                </div>
                                {stat.digit === latestDigit && <span className='manual-trading-digit__active-arrow' />}
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className='manual-trading-ticket'>
                <div className='manual-trading-ticket__header'>
                    <h2>Digit trade type</h2>
                    <span>{selectedMarket.label}</span>
                </div>

                <div className='manual-trading-trade-types'>
                    {TRADE_GROUPS.map(option => (
                        <button
                            className={classNames('manual-trading-trade-types__button', {
                                'manual-trading-trade-types__button--active': tradeGroup === option.value,
                            })}
                            key={option.value}
                            type='button'
                            onClick={() => setTradeGroup(option.value)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                {needsBarrier && (
                    <div className='manual-trading-barrier'>
                        {Array.from({ length: 10 }, (_, digit) => String(digit)).map(digit => (
                            <button
                                className={classNames('manual-trading-barrier__digit', {
                                    'manual-trading-barrier__digit--active': selectedBarrier === digit,
                                })}
                                key={digit}
                                type='button'
                                onClick={() => setSelectedBarrier(digit)}
                            >
                                {digit}
                            </button>
                        ))}
                    </div>
                )}

                <div className='manual-trading-ticket__inputs'>
                    <label className='manual-trading-field'>
                        <span>Duration</span>
                        <div className='manual-trading-inline-input'>
                            <input
                                aria-label='Duration in ticks'
                                className='manual-trading-field__control'
                                inputMode='numeric'
                                value={durationInput}
                                onBlur={handleDurationBlur}
                                onChange={event => handleDurationChange(event.target.value)}
                            />
                            <span>ticks</span>
                        </div>
                    </label>
                    <label className='manual-trading-field'>
                        <span>Stake</span>
                        <div className='manual-trading-inline-input'>
                            <input
                                aria-label='Stake'
                                className='manual-trading-field__control'
                                inputMode='decimal'
                                value={stakeInput}
                                onChange={event => handleStakeChange(event.target.value)}
                            />
                            <span>{currency}</span>
                        </div>
                    </label>
                </div>

                <div className='manual-trading-actions'>
                    {activeActions.map(action => (
                        <button
                            className={`manual-trading-actions__button manual-trading-actions__button--${action.tone}`}
                            disabled={isPurchasing}
                            key={action.contractType}
                            type='button'
                            onClick={() => void handleManualPurchase(action)}
                        >
                            <strong>{action.label}</strong>
                            <span>{proposalPayouts[action.contractType] || 'Payout loading'}</span>
                        </button>
                    ))}
                </div>

                {(tradeMessage || tradeError) && (
                    <div
                        className={classNames('manual-trading-ticket__message', {
                            'manual-trading-ticket__message--error': Boolean(tradeError),
                        })}
                    >
                        {tradeError || tradeMessage}
                    </div>
                )}
            </section>
        </div>
    );
});

export default ManualTrading;
