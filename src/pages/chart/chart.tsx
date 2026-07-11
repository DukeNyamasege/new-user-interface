import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import ChunkLoader from '@/components/loader/chunk-loader';
import ChartSettingsModal from '@/components/ui/chart-settings-modal/ChartSettingsModal';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import { useSmartChartAdaptor } from '@/hooks/useSmartChartAdaptor';
import { useStore } from '@/hooks/useStore';
import { FastMarker, SmartChart, TGranularity, TStateChangeListener } from '@deriv-com/smartcharts-champion';
import { useDevice } from '@deriv-com/ui';
import ToolbarWidgets from './toolbar-widgets';
import '@deriv-com/smartcharts-champion/dist/smartcharts.css';

const getPrecisionFromPip = (pip?: number) => {
    if (!pip || !Number.isFinite(pip)) return 2;

    const pipString = pip.toString();
    if (!pipString.includes('.')) return 0;

    return pipString.split('.')[1].replace(/0+$/, '').length;
};

type TLiveMarkerHandle = {
    div?: HTMLDivElement | null;
    setPosition: (position: { epoch: number | null; price: number | null }) => void;
};

const Chart = observer(
    ({ chart_instance_id, show_digits_stats }: { chart_instance_id: string; show_digits_stats: boolean }) => {
        const barriers: [] = [];
        const { common, ui } = useStore();
        const { chart_store, run_panel, dashboard } = useStore();
        const [isSafari, setIsSafari] = useState(false);
        const [current_price, setCurrentPrice] = useState<number | null>(null);
        const [current_epoch, setCurrentEpoch] = useState<number | null>(null);
        const live_marker_ref = useRef<TLiveMarkerHandle | null>(null);

        const {
            chart_type,
            getMarketsOrder,
            granularity,
            setChartStatus,
            symbol,
            updateChartType,
            updateGranularity,
            updateSymbol,
        } = chart_store;

        const { chartData, getQuotes, subscribeQuotes, unsubscribeQuotes } = useSmartChartAdaptor();
        const { isDesktop, isMobile } = useDevice();
        const { is_drawer_open } = run_panel;
        const { is_chart_modal_visible } = dashboard;
        const activeSymbol = chartData.activeSymbols.find(active_symbol => active_symbol.symbol === symbol);
        const price_precision = useMemo(() => getPrecisionFromPip(activeSymbol?.pip), [activeSymbol?.pip]);

        const chartStyle = {
            backgroundColor: ui.backgroundColor,
            '--candle-up-color': ui.candleUpColor,
            '--candle-down-color': ui.candleDownColor,
            '--background-color': ui.backgroundColor,
            '--show-grid': ui.showGrid ? '1' : '0',
            '--candle-mode': ui.candleMode,
        };

        const settings = {
            assetInformation: false,
            countdown: true,
            isAutoScale: true,
            isHighestLowestMarkerEnabled: false,
            language: common.current_language.toLowerCase(),
            position: ui.is_chart_layout_default ? 'bottom' : 'left',
            theme: ui.is_dark_mode_on ? 'dark' : 'light',
            whitespace: 0,
        };

        useEffect(() => {
            const isSafariBrowser = () => {
                const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
                const hasWebkitFeatures = 'webkitAudioContext' in window || 'WebKitMediaSource' in window;

                return isSafari && hasWebkitFeatures;
            };

            setIsSafari(isSafariBrowser());

            return () => {
                chart_api.api.forgetAll('ticks');
            };
        }, []);

        useEffect(() => {
            if (!symbol) updateSymbol();
        }, [symbol, updateSymbol]);

        useEffect(() => {
            let is_cancelled = false;

            const loadInitialMarker = async () => {
                if (!symbol) return;

                try {
                    const initial_quotes = await getQuotes({
                        symbol,
                        granularity: granularity as TGranularity,
                        count: granularity === 0 ? 200 : 120,
                    });

                    if (is_cancelled) return;

                    const latest_candle = initial_quotes.candles?.at(-1);
                    const latest_tick_price = initial_quotes.history?.prices?.at(-1);
                    const latest_tick_time = initial_quotes.history?.times?.at(-1);

                    const latest_price = latest_candle?.close ?? latest_tick_price ?? null;
                    const latest_epoch = latest_candle?.epoch ?? latest_tick_time ?? null;

                    setCurrentPrice(typeof latest_price === 'number' ? latest_price : null);
                    setCurrentEpoch(typeof latest_epoch === 'number' ? latest_epoch : null);
                } catch {
                    setCurrentPrice(null);
                    setCurrentEpoch(null);
                }
            };

            void loadInitialMarker();

            return () => {
                is_cancelled = true;
                setCurrentPrice(null);
                setCurrentEpoch(null);
            };
        }, [getQuotes, granularity, symbol]);

        useEffect(() => {
            if (!symbol) return undefined;

            const unsubscribe_live_quote = subscribeQuotes(
                {
                    symbol,
                    granularity: granularity as TGranularity,
                },
                quote => {
                    const next_price = Number(quote.Close);
                    const next_epoch = Number(quote.Date);

                    setCurrentPrice(Number.isFinite(next_price) ? next_price : null);
                    setCurrentEpoch(Number.isFinite(next_epoch) ? next_epoch : null);
                }
            );

            return () => {
                unsubscribe_live_quote?.();
                unsubscribeQuotes({
                    symbol,
                    granularity: granularity as TGranularity,
                });
            };
        }, [granularity, subscribeQuotes, symbol, unsubscribeQuotes]);

        const setLiveMarker = useCallback((marker: TLiveMarkerHandle | null) => {
            live_marker_ref.current = marker;
        }, []);

        useEffect(() => {
            const marker = live_marker_ref.current;
            if (!marker) return;

            marker.setPosition({
                epoch: current_epoch,
                price: current_price,
            });

            if (marker.div) {
                marker.div.setAttribute('data-price', current_price === null ? '' : current_price.toFixed(price_precision));
            }
        }, [current_epoch, current_price, price_precision]);

        const is_connection_opened = !!chart_api?.api;

        const handleStateChange: TStateChangeListener = state => {
            if (state === 'READY') {
                setChartStatus(true);
            }
        };

        if (!symbol || chartData.activeSymbols.length === 0) {
            return <ChunkLoader message='' />;
        }

        return (
            <>
                <div
                    className={classNames('dashboard__chart-wrapper', {
                        'dashboard__chart-wrapper--expanded': is_drawer_open && isDesktop,
                        'dashboard__chart-wrapper--modal': is_chart_modal_visible && isDesktop,
                        'dashboard__chart-wrapper--safari': isSafari,
                    })}
                    style={chartStyle}
                    dir='ltr'
                >
                    <SmartChart
                        id={`dbot-${chart_instance_id}-${symbol}`}
                        key={`chart-${chart_instance_id}-${symbol}`}
                        barriers={barriers}
                        showLastDigitStats={show_digits_stats}
                        chartControlsWidgets={null}
                        enabledChartFooter={false}
                        stateChangeListener={handleStateChange}
                        toolbarWidget={() => (
                            <ToolbarWidgets
                                updateChartType={updateChartType}
                                updateGranularity={updateGranularity}
                                position={!isDesktop ? 'bottom' : 'top'}
                                isDesktop={isDesktop}
                            />
                        )}
                        chartType={chart_type}
                        isMobile={isMobile}
                        enabledNavigationWidget={isDesktop}
                        granularity={granularity as TGranularity}
                        getQuotes={getQuotes}
                        subscribeQuotes={subscribeQuotes}
                        unsubscribeQuotes={unsubscribeQuotes}
                        chartData={{ activeSymbols: chartData.activeSymbols, tradingTimes: chartData.tradingTimes }}
                        symbol={symbol}
                        settings={settings}
                        isConnectionOpened={is_connection_opened}
                        getMarketsOrder={getMarketsOrder}
                        leftMargin={80}
                        drawingToolFloatingMenuPosition={isMobile ? { x: 100, y: 100 } : { x: 200, y: 200 }}
                    >
                        <FastMarker markerRef={setLiveMarker} className='dashboard__live-price-marker'>
                            <span className='dashboard__live-price-marker__dot' />
                            <span className='dashboard__live-price-marker__line' />
                            <span className='dashboard__live-price-marker__value'>
                                {current_price === null ? '' : current_price.toFixed(price_precision)}
                            </span>
                        </FastMarker>
                    </SmartChart>
                </div>
                {ui.showChartSettingsModal && <ChartSettingsModal />}
            </>
        );
    }
);

export default Chart;
