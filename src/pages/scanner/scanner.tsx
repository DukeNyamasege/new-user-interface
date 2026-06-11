import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useDevice } from '@deriv-com/ui';
import { DBOT_TABS } from '@/constants/bot-contents';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import {
    DIGIT_STRATEGIES,
    evaluateDigitStrategy,
    SUPPORTED_VOLATILITY_MARKETS,
    type DigitStrategyId,
} from '@/utils/digit-strategy';
import { getLastDigitFromQuote } from '@/utils/market-data';
import { safeSubscribe } from '@/utils/websocket-handler';
import './scanner.scss';

type TScannerMarketState = {
    alertActive: boolean;
    entryReady: boolean;
    latestDigit: number | null;
    latestQuote: number | null;
    qualifyingWinningDigits: number[];
    recentDigits: number[];
    symbol: string;
    trailingTriggerCount: number;
};

const HISTORY_TICKS = 200;

const createMarketState = (symbol: string): TScannerMarketState => ({
    alertActive: false,
    entryReady: false,
    latestDigit: null,
    latestQuote: null,
    qualifyingWinningDigits: [],
    recentDigits: [],
    symbol,
    trailingTriggerCount: 0,
});

const Scanner = observer(() => {
    const { dashboard, run_panel } = useStore();
    const { isDesktop } = useDevice();
    const { active_tab } = dashboard;
    const [strategyId, setStrategyId] = useState<DigitStrategyId>('OVER_2_MARKET');
    const [marketStates, setMarketStates] = useState<Record<string, TScannerMarketState>>(
        Object.fromEntries(SUPPORTED_VOLATILITY_MARKETS.map(market => [market.symbol, createMarketState(market.symbol)]))
    );
    const subscriptionsRef = useRef<Record<string, { unsubscribe?: () => void }>>({});
    const digitsHistoryRef = useRef<Record<string, number[]>>({});
    const activeVersionRef = useRef(0);
    const showScanner = active_tab === DBOT_TABS.SCANNER;
    const isCoveredByMobileRunPanel = !isDesktop && run_panel.is_drawer_open;

    const refreshMarketState = useCallback((symbol: string, quote: number) => {
        const market = SUPPORTED_VOLATILITY_MARKETS.find(item => item.symbol === symbol);
        if (!market) return;

        const digit = getLastDigitFromQuote(quote, symbol, market.pip ?? 2);
        const nextDigits = [...(digitsHistoryRef.current[symbol] ?? []), digit].slice(-HISTORY_TICKS);
        digitsHistoryRef.current[symbol] = nextDigits;

        const digitPercentages = Object.fromEntries(
            Array.from({ length: 10 }, (_, candidate) => [
                candidate,
                nextDigits.length
                    ? Math.round((nextDigits.filter(value => value === candidate).length / nextDigits.length) * 10000) / 100
                    : 0,
            ])
        );
        const evaluation = evaluateDigitStrategy(strategyId, digitPercentages, nextDigits);

        setMarketStates(previous => ({
            ...previous,
            [symbol]: {
                alertActive: evaluation.isQualified,
                entryReady: evaluation.entryReady,
                latestDigit: digit,
                latestQuote: quote,
                qualifyingWinningDigits: evaluation.qualifyingWinningDigits,
                recentDigits: nextDigits.slice(-4),
                symbol,
                trailingTriggerCount: evaluation.trailingTriggerCount,
            },
        }));
    }, [strategyId]);

    useEffect(() => {
        if (!showScanner || !api_base.api) return undefined;

        activeVersionRef.current += 1;
        const version = activeVersionRef.current;

        Object.values(subscriptionsRef.current).forEach(subscription => subscription.unsubscribe?.());
        subscriptionsRef.current = {};
        digitsHistoryRef.current = {};
        setMarketStates(
            Object.fromEntries(SUPPORTED_VOLATILITY_MARKETS.map(market => [market.symbol, createMarketState(market.symbol)]))
        );

        SUPPORTED_VOLATILITY_MARKETS.forEach(market => {
            void (async () => {
                try {
                    const history = await (api_base.api as any).send({
                        adjust_start_time: 1,
                        count: HISTORY_TICKS,
                        end: 'latest',
                        start: 1,
                        style: 'ticks',
                        ticks_history: market.symbol,
                    });
                    if (activeVersionRef.current !== version) return;

                    const prices = Array.isArray(history?.history?.prices) ? history.history.prices : [];
                    prices.forEach((price: number | string) => {
                        const quote = Number(price);
                        if (Number.isFinite(quote)) {
                            refreshMarketState(market.symbol, quote);
                        }
                    });

                    const observable = (api_base.api as any).subscribe({ ticks: market.symbol });
                    subscriptionsRef.current[market.symbol] = safeSubscribe(observable, (data: any) => {
                        if (activeVersionRef.current !== version) return;
                        const quote = Number(data?.tick?.quote);
                        if (Number.isFinite(quote)) {
                            refreshMarketState(market.symbol, quote);
                        }
                    });
                } catch {
                    // Keep individual market failures isolated so the rest of the board can continue updating.
                }
            })();
        });

        return () => {
            activeVersionRef.current += 1;
            Object.values(subscriptionsRef.current).forEach(subscription => subscription.unsubscribe?.());
            subscriptionsRef.current = {};
        };
    }, [refreshMarketState, showScanner]);

    const sortedMarkets = useMemo(() => {
        const states = SUPPORTED_VOLATILITY_MARKETS.map(market => ({
            ...market,
            ...marketStates[market.symbol],
        }));

        return states.sort((left, right) => {
            const leftScore = Number(left.entryReady) * 2 + Number(left.alertActive);
            const rightScore = Number(right.entryReady) * 2 + Number(right.alertActive);
            return rightScore - leftScore || left.label.localeCompare(right.label);
        });
    }, [marketStates]);

    const openInAutoTrades = (symbol: string) => {
        const strategy = DIGIT_STRATEGIES[strategyId];
        localStorage.setItem('auto_trades_strategyTemplate', strategyId);
        localStorage.setItem('auto_trades_tradeType', strategy.contractType);
        localStorage.setItem('auto_trades_barrier', strategy.winBarrier);
        localStorage.setItem('auto_trades_markets', JSON.stringify([symbol]));
        dashboard.setActiveTab(DBOT_TABS.AUTO_TRADES);
    };

    if (!showScanner) return null;

    return (
        <div className={`scanner-page${isCoveredByMobileRunPanel ? ' scanner-page--run-panel-open' : ''}`}>
            <div className='scanner-page__panel'>
                <div className='scanner-page__header'>
                    <div>
                        <h1>Strategy Scanner</h1>
                        <p>Live alert board for the two requested digit strategies across all supported markets.</p>
                    </div>
                    <label className='scanner-page__filter'>
                        <span>Strategy</span>
                        <select value={strategyId} onChange={event => setStrategyId(event.target.value as DigitStrategyId)}>
                            <option value='OVER_2_MARKET'>Over 2 Market</option>
                            <option value='UNDER_7_MARKET'>Under 7 Market</option>
                        </select>
                    </label>
                </div>

                <div className='scanner-page__summary'>
                    <div className='scanner-page__summary-card'>
                        <strong>{sortedMarkets.filter(market => market.alertActive).length}</strong>
                        <span>Markets on alert</span>
                    </div>
                    <div className='scanner-page__summary-card'>
                        <strong>{sortedMarkets.filter(market => market.entryReady).length}</strong>
                        <span>Entry-ready now</span>
                    </div>
                    <div className='scanner-page__summary-card'>
                        <strong>{SUPPORTED_VOLATILITY_MARKETS.length}</strong>
                        <span>Markets monitored</span>
                    </div>
                </div>

                <div className='scanner-page__grid'>
                    {sortedMarkets.map(market => (
                        <article
                            key={market.symbol}
                            className={`scanner-page__market${market.entryReady ? ' scanner-page__market--ready' : market.alertActive ? ' scanner-page__market--alert' : ''}`}
                        >
                            <div className='scanner-page__market-top'>
                                <div>
                                    <h2>{market.label}</h2>
                                    <p>{market.symbol}</p>
                                </div>
                                <div className='scanner-page__badge'>
                                    {market.entryReady ? 'ENTRY READY' : market.alertActive ? 'ALERT' : 'WATCHING'}
                                </div>
                            </div>

                            <div className='scanner-page__market-stats'>
                                <span>Quote: {market.latestQuote?.toFixed(market.pip ?? 2) ?? '--'}</span>
                                <span>Last digit: {market.latestDigit ?? '--'}</span>
                            </div>

                            <p className='scanner-page__market-copy'>
                                {market.alertActive
                                    ? `Winning digits >= 10.5%: ${market.qualifyingWinningDigits.join(', ')}`
                                    : 'Waiting for the percentage setup to qualify.'}
                            </p>
                            <p className='scanner-page__market-copy'>
                                Recent digits: {market.recentDigits.length ? market.recentDigits.join(', ') : '--'} | Trigger streak:{' '}
                                {market.trailingTriggerCount}/3
                            </p>

                            <button
                                className='scanner-page__open-button'
                                type='button'
                                onClick={() => openInAutoTrades(market.symbol)}
                                disabled={!market.alertActive}
                            >
                                Open in Auto Trades
                            </button>
                        </article>
                    ))}
                </div>
            </div>
        </div>
    );
});

export default Scanner;
