import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { buyContractForUi, normalizeTradeParameters } from '@/utils/trade-purchase';
import ChartWrapper from '@/pages/chart/chart-wrapper';
import styles from './up-and-down.module.scss';

// ─── Trade Types (left sidebar) ───────────────────────────────────────────────
const TRADE_TYPES = [
    { id: 'rise_fall', label: 'Rise / Fall', icon: '↗', color: '#e05a84' },
    { id: 'higher_lower', label: 'Higher / Lower', icon: '↕', color: '#9ea9ba' },
    { id: 'digits', label: 'Digits', icon: '#', color: '#9ea9ba' },
    { id: 'touch_no_touch', label: 'Touch / No Touch', icon: '◎', color: '#9ea9ba' },
    { id: 'ends_in_out', label: 'Ends In / Out', icon: '⤶', color: '#9ea9ba' },
    { id: 'stays_in_out', label: 'Stays In / Out', icon: '⬜', color: '#9ea9ba' },
    { id: 'asian', label: 'Asian', icon: '〰', color: '#9ea9ba' },
    { id: 'multiplier', label: 'Multiplier', icon: '✕', color: '#9ea9ba' },
    { id: 'accumulator', label: 'Accumulator', icon: '⊕', color: '#9ea9ba' },
    { id: 'reset', label: 'Reset', icon: '↺', color: '#9ea9ba' },
    { id: 'lookback', label: 'Lookback', icon: '◷', color: '#9ea9ba' },
    { id: 'only_ups_downs', label: 'Only Ups/Downs', icon: '⇅', color: '#9ea9ba' },
] as const;

type TTradeTypeId = (typeof TRADE_TYPES)[number]['id'];

// ─── Markets available ────────────────────────────────────────────────────────
const MARKETS = [
    { label: 'Volatility 100 (1s) Index', symbol: '1HZ100V' },
    { label: 'Volatility 100 Index', symbol: 'R_100' },
    { label: 'Volatility 75 (1s) Index', symbol: '1HZ75V' },
    { label: 'Volatility 75 Index', symbol: 'R_75' },
    { label: 'Volatility 50 (1s) Index', symbol: '1HZ50V' },
    { label: 'Volatility 25 Index', symbol: 'R_25' },
    { label: 'Volatility 10 Index', symbol: 'R_10' },
];

const DEFAULT_SYMBOL = '1HZ100V';
const DEFAULT_DURATION = 5;
const DEFAULT_STAKE = '1';

// ─── Component ────────────────────────────────────────────────────────────────
const UpAndDown = observer(() => {
    const { client, dashboard } = useStore();
    const { active_tab } = dashboard;

    const [selectedType, setSelectedType] = useState<TTradeTypeId>('rise_fall');
    const [centerTab, setCenterTab] = useState<'trading' | 'reference'>('trading');
    const [marketStrengthOpen, setMarketStrengthOpen] = useState(true);
    const [moreSettingsOpen, setMoreSettingsOpen] = useState(false);
    const [autoSignal, setAutoSignal] = useState(false);

    const [symbol] = useState(DEFAULT_SYMBOL);
    const [duration, setDuration] = useState(DEFAULT_DURATION);
    const [stake, setStake] = useState(DEFAULT_STAKE);

    const [risePayout, setRisePayout] = useState('1.85');
    const [fallPayout, setFallPayout] = useState('1.85');
    const [payoutLoading, setPayoutLoading] = useState(false);

    const [tradeLoading, setTradeLoading] = useState<'rise' | 'fall' | null>(null);
    const [tradeMsg, setTradeMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const proposalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currency = client?.currency || 'USD';
    const isLoggedIn = client?.is_logged_in;

    // ── Payout Estimate (proposal) ──────────────────────────────────────────
    const fetchPayouts = useCallback(async () => {
        const stakeNum = parseFloat(stake);
        if (!stakeNum || stakeNum <= 0) return;

        if (!isLoggedIn || !api_base.is_authorized) {
            const est = (stakeNum * 1.85).toFixed(2);
            setRisePayout(est);
            setFallPayout(est);
            return;
        }

        setPayoutLoading(true);
        try {
            const [rRes, fRes] = await Promise.allSettled([
                (api_base.api as any).send({
                    proposal: 1,
                    subscribe: 0,
                    contract_type: 'CALL',
                    underlying_symbol: symbol,
                    duration,
                    duration_unit: 't',
                    amount: stakeNum,
                    basis: 'stake',
                    currency,
                }),
                (api_base.api as any).send({
                    proposal: 1,
                    subscribe: 0,
                    contract_type: 'PUT',
                    underlying_symbol: symbol,
                    duration,
                    duration_unit: 't',
                    amount: stakeNum,
                    basis: 'stake',
                    currency,
                }),
            ]);

            if (rRes.status === 'fulfilled' && rRes.value?.proposal?.payout) {
                setRisePayout(Number(rRes.value.proposal.payout).toFixed(2));
            }
            if (fRes.status === 'fulfilled' && fRes.value?.proposal?.payout) {
                setFallPayout(Number(fRes.value.proposal.payout).toFixed(2));
            }
        } catch {
            const est = (stakeNum * 1.85).toFixed(2);
            setRisePayout(est);
            setFallPayout(est);
        } finally {
            setPayoutLoading(false);
        }
    }, [isLoggedIn, symbol, duration, stake, currency]);

    useEffect(() => {
        if (proposalTimer.current) clearTimeout(proposalTimer.current);
        proposalTimer.current = setTimeout(fetchPayouts, 600);
        return () => {
            if (proposalTimer.current) clearTimeout(proposalTimer.current);
        };
    }, [fetchPayouts]);

    // ── Execute Trade ───────────────────────────────────────────────────────
    const executeTrade = async (contractType: 'CALL' | 'PUT') => {
        const stakeNum = parseFloat(stake);
        if (!stakeNum || stakeNum <= 0) {
            setTradeMsg({ type: 'error', text: 'Please enter a valid stake amount.' });
            setTimeout(() => setTradeMsg(null), 3500);
            return;
        }

        const dir = contractType === 'CALL' ? 'rise' : 'fall';
        setTradeLoading(dir);
        setTradeMsg(null);

        try {
            const parameters = normalizeTradeParameters({
                contract_type: contractType,
                underlying_symbol: symbol,
                duration,
                duration_unit: 't',
                amount: stakeNum,
                basis: 'stake',
                currency,
            });
            await buyContractForUi({ parameters, price: stakeNum, source: 'TradeTypes' });
            setTradeMsg({ type: 'success', text: `${dir === 'rise' ? 'Rise' : 'Fall'} contract purchased successfully!` });
        } catch (e: any) {
            setTradeMsg({ type: 'error', text: e?.message || 'Trade failed. Please try again.' });
        } finally {
            setTradeLoading(null);
            setTimeout(() => setTradeMsg(null), 4500);
        }
    };

    const stakeNum = parseFloat(stake) || 0;

    return (
        <div className={styles.page}>
            {/* ── LEFT SIDEBAR ─────────────────────────────────────────── */}
            <aside className={styles.sidebar}>
                {TRADE_TYPES.map(tt => (
                    <button
                        key={tt.id}
                        className={`${styles.sidebar_item} ${selectedType === tt.id ? styles.sidebar_item_active : ''}`}
                        onClick={() => setSelectedType(tt.id)}
                        title={tt.label}
                    >
                        <span
                            className={styles.sidebar_icon}
                            style={{ color: selectedType === tt.id ? tt.color : '#6b7a99' }}
                        >
                            {tt.icon}
                        </span>
                        <span className={styles.sidebar_label}>{tt.label}</span>
                    </button>
                ))}
            </aside>

            {/* ── CENTER CHART ──────────────────────────────────────────── */}
            <main className={styles.center}>
                {/* Tab bar */}
                <div className={styles.center_tabs}>
                    <button
                        className={`${styles.center_tab} ${centerTab === 'trading' ? styles.center_tab_active : ''}`}
                        onClick={() => setCenterTab('trading')}
                    >
                        <span className={styles.center_tab_icon}>📈</span>
                        Trading
                    </button>
                    <button
                        className={`${styles.center_tab} ${centerTab === 'reference' ? styles.center_tab_active : ''}`}
                        onClick={() => setCenterTab('reference')}
                    >
                        <span className={styles.center_tab_icon}>📋</span>
                        Reference
                    </button>
                </div>

                {/* Chart or Reference content */}
                {centerTab === 'trading' ? (
                    <div className={styles.chart_shell}>
                        <ChartWrapper
                            prefix='trade-types-chart'
                            refresh_token={active_tab === DBOT_TABS.UP_AND_DOWN ? 'active' : 'inactive'}
                            show_digits_stats={false}
                        />
                    </div>
                ) : (
                    <div className={styles.reference_panel}>
                        <h2 className={styles.reference_title}>Contract Reference</h2>
                        <p className={styles.reference_desc}>
                            Select a contract type from the left to view its specifications and payout conditions.
                        </p>
                        <div className={styles.reference_grid}>
                            {TRADE_TYPES.map(tt => (
                                <div key={tt.id} className={styles.reference_card}>
                                    <span className={styles.reference_card_icon} style={{ color: tt.color }}>
                                        {tt.icon}
                                    </span>
                                    <div>
                                        <div className={styles.reference_card_title}>{tt.label}</div>
                                        <div className={styles.reference_card_desc}>
                                            Trade on the direction of the market.
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* ── RIGHT PANEL ───────────────────────────────────────────── */}
            <aside className={styles.panel}>
                {/* MARKET STRENGTH header */}
                <button
                    className={styles.panel_section_header}
                    onClick={() => setMarketStrengthOpen(o => !o)}
                >
                    <span className={styles.panel_section_title}>MARKET STRENGTH</span>
                    <span className={`${styles.panel_chevron} ${marketStrengthOpen ? styles.panel_chevron_open : ''}`}>
                        ∨
                    </span>
                </button>

                {marketStrengthOpen && (
                    <div className={styles.panel_body}>
                        {/* PARAMETERS label */}
                        <div className={styles.panel_label}>PARAMETERS</div>

                        {/* Contract type selector */}
                        <button className={styles.contract_type_btn}>Rise / Fall</button>

                        {/* CONTRACT */}
                        <div className={styles.param_row}>
                            <label className={styles.param_label}>CONTRACT</label>
                            <select className={styles.param_select}>
                                <option>Rise / Fall</option>
                            </select>
                        </div>

                        {/* DURATION */}
                        <div className={styles.param_row}>
                            <label className={styles.param_label}>DURATION</label>
                            <div className={styles.param_inputs}>
                                <input
                                    className={styles.param_number}
                                    type='number'
                                    min={1}
                                    max={10}
                                    value={duration}
                                    onChange={e => setDuration(Math.min(10, Math.max(1, Number(e.target.value))))}
                                />
                                <div className={styles.param_unit}>Ticks</div>
                            </div>
                            <div className={styles.param_hint}>Allowed: 1-10 ticks</div>
                        </div>

                        {/* STAKE */}
                        <div className={styles.param_row}>
                            <label className={styles.param_label}>STAKE</label>
                            <div className={styles.param_inputs}>
                                <input
                                    className={styles.param_number}
                                    type='number'
                                    min={0.35}
                                    step={0.01}
                                    value={stake}
                                    onChange={e => setStake(e.target.value)}
                                />
                                <div className={styles.param_unit}>{currency}</div>
                            </div>
                        </div>

                        {/* EXECUTE section */}
                        <div className={styles.execute_label}>EXECUTE</div>

                        {/* AUTO SIGNAL toggle */}
                        <div className={styles.autosignal_row}>
                            <span className={styles.autosignal_dot} />
                            <span className={styles.autosignal_text}>AUTO SIGNAL</span>
                            <button
                                className={`${styles.autosignal_toggle} ${autoSignal ? styles.autosignal_toggle_on : ''}`}
                                onClick={() => setAutoSignal(v => !v)}
                            >
                                {autoSignal ? 'ON' : 'OFF'}
                            </button>
                        </div>

                        {/* More Settings */}
                        <button
                            className={styles.more_settings_btn}
                            onClick={() => setMoreSettingsOpen(v => !v)}
                        >
                            More Settings
                            <span className={`${styles.more_settings_chevron} ${moreSettingsOpen ? styles.more_settings_chevron_open : ''}`}>
                                ∨
                            </span>
                        </button>

                        {moreSettingsOpen && (
                            <div className={styles.more_settings_body}>
                                <div className={styles.param_row}>
                                    <label className={styles.param_label}>MARKET</label>
                                    <div className={styles.param_hint} style={{ marginTop: 0 }}>
                                        {MARKETS.find(m => m.symbol === symbol)?.label ?? symbol}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Trade message */}
                        {tradeMsg && (
                            <div
                                className={`${styles.trade_msg} ${tradeMsg.type === 'success' ? styles.trade_msg_success : styles.trade_msg_error}`}
                            >
                                {tradeMsg.text}
                            </div>
                        )}
                    </div>
                )}

                {/* RISE / FALL action buttons */}
                <div className={styles.action_buttons}>
                    <button
                        className={styles.btn_rise}
                        onClick={() => executeTrade('CALL')}
                        disabled={tradeLoading !== null}
                    >
                        <span className={styles.btn_direction}>
                            {tradeLoading === 'rise' ? 'Buying…' : 'Rise'}
                        </span>
                        <span className={styles.btn_payout}>
                            {payoutLoading ? '...' : `Payout ${risePayout} ${currency}`}
                        </span>
                    </button>
                    <button
                        className={styles.btn_fall}
                        onClick={() => executeTrade('PUT')}
                        disabled={tradeLoading !== null}
                    >
                        <span className={styles.btn_direction}>
                            {tradeLoading === 'fall' ? 'Buying…' : 'Fall'}
                        </span>
                        <span className={styles.btn_payout}>
                            {payoutLoading ? '...' : `Payout ${fallPayout} ${currency}`}
                        </span>
                    </button>
                </div>
            </aside>
        </div>
    );
});

export default UpAndDown;
