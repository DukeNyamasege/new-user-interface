import { useCallback, useMemo,useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Button from '@/components/shared_ui/button';
import Input from '@/components/shared_ui/input';
import Money from '@/components/shared_ui/money';
import ThemedScrollbars from '@/components/shared_ui/themed-scrollbars';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { Localize } from '@deriv-com/translations';

const MARKETS = [
    'Volatility 10 Index',
    'Volatility 25 Index',
    'Volatility 50 Index',
    'Volatility 75 Index',
    'Volatility 100 Index',
    'Volatility 200 Index',
    'Range Break 100 Index',
    'Range Break 200 Index',
    'Step Index',
] as const;

const TRADE_TYPES = ['Rise', 'Fall', 'Over', 'Under', 'Even', 'Odd', 'Matches', 'Differs'] as const;

type Market = (typeof MARKETS)[number];
type TradeType = (typeof TRADE_TYPES)[number];

interface ComboRow {
    id: string;
    market: Market | '';
    tradeType: TradeType | '';
    stake: string;
    barrier: string;
}

const createRow = (): ComboRow => ({
    id: crypto.randomUUID(),
    market: '',
    tradeType: '',
    stake: '',
    barrier: '',
});

const Combo = observer(() => {
    const { run_panel, dashboard, client, transactions } = useStore();
    const { currency } = client;
    const [rows, setRows] = useState<ComboRow[]>([createRow()]);
    const [isExecuting, setIsExecuting] = useState(false);

    const { active_tab } = dashboard;
    const { is_running } = run_panel;
    const { statistics } = transactions;
    const { total_profit, total_stake } = statistics;

    // Show only on combo tab
    const show_combo = active_tab === DBOT_TABS.COMBO;

    const updateRow = useCallback((id: string, field: keyof ComboRow, value: string) => {
        setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
    }, []);

    const removeRow = useCallback((id: string) => {
        setRows(prev => (prev.length > 1 ? prev.filter(r => r.id !== id) : prev));
    }, []);

    const addRow = useCallback(() => {
        setRows(prev => [...prev, createRow()]);
    }, []);

    const totalStake = useMemo(() => rows.reduce((s, r) => s + (Number(r.stake) || 0), 0), [rows]);

    const validRows = useMemo(() => rows.filter(r => r.market && r.tradeType && Number(r.stake) > 0), [rows]);

    // Execute combo trades using the bot engine
    const executeCombo = useCallback(async () => {
        if (validRows.length === 0 || isExecuting) return;

        setIsExecuting(true);

        try {
            // For now, just simulate execution since the actual trading needs proper blockly integration
            // In a full implementation, this would:
            // 1. Create blockly XML for each trade
            // 2. Queue them for sequential execution
            // 3. Handle results and summaries

            await new Promise(resolve => setTimeout(resolve, 2000));

            console.log('Combo trades executed:', validRows);
        } catch (error) {
            console.error('Combo execution error:', error);
        } finally {
            setIsExecuting(false);
        }
    }, [validRows, isExecuting]);

    if (!show_combo) return null;

    return (
        <div className='combo-page'>
            <div className='combo-page__inner'>
                {/* Header */}
                <div className='combo-page__header'>
                    <div className='combo-page__header-title'>
                        <h1>
                            <Localize i18n_default_text='Combo Trading' />
                        </h1>
                        <p>
                            <Localize i18n_default_text='Execute multiple trades at once' />
                        </p>
                    </div>
                </div>

                {/* Main Content */}
                <div className='combo-page__content'>
                    {/* Combo Builder */}
                    <div className='combo-builder'>
                        <div className='combo-builder__header'>
                            <h2>
                                <Localize i18n_default_text='Combo Builder' />
                            </h2>
                            <Button onClick={addRow} has_effect primary className='combo-builder__add-btn'>
                                + <Localize i18n_default_text='Add Combo' />
                            </Button>
                        </div>

                        <ThemedScrollbars className='combo-builder__rows'>
                            <div className='combo-builder__rows-inner'>
                                {rows.map((row, i) => (
                                    <div key={row.id} className='combo-row'>
                                        <div className='combo-row__number'>{i + 1}</div>

                                        <div className='combo-row__field'>
                                            <label>
                                                <Localize i18n_default_text='Market' />
                                            </label>
                                            <select
                                                value={row.market}
                                                onChange={e => updateRow(row.id, 'market', e.target.value)}
                                                className='combo-row__select'
                                            >
                                                <option value=''>
                                                    <Localize i18n_default_text='Select market' />
                                                </option>
                                                {MARKETS.map(m => (
                                                    <option key={m} value={m}>
                                                        {m}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className='combo-row__field'>
                                            <label>
                                                <Localize i18n_default_text='Trade Type' />
                                            </label>
                                            <select
                                                value={row.tradeType}
                                                onChange={e => updateRow(row.id, 'tradeType', e.target.value)}
                                                className='combo-row__select'
                                            >
                                                <option value=''>
                                                    <Localize i18n_default_text='Select type' />
                                                </option>
                                                {TRADE_TYPES.map(t => (
                                                    <option key={t} value={t}>
                                                        {t}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className='combo-row__field'>
                                            <label>
                                                <Localize i18n_default_text='Stake ($)' />
                                            </label>
                                            <Input
                                                type='number'
                                                min='0.01'
                                                step='0.01'
                                                value={row.stake}
                                                onChange={e => updateRow(row.id, 'stake', e.target.value)}
                                                className='combo-row__input'
                                                placeholder='0.00'
                                            />
                                        </div>

                                        {(row.tradeType === 'Over' || row.tradeType === 'Under') && (
                                            <div className='combo-row__field'>
                                                <label>
                                                    <Localize i18n_default_text='Barrier' />
                                                </label>
                                                <Input
                                                    type='number'
                                                    value={row.barrier}
                                                    onChange={e => updateRow(row.id, 'barrier', e.target.value)}
                                                    className='combo-row__input'
                                                    placeholder='1234'
                                                />
                                            </div>
                                        )}

                                        <button
                                            className={classNames('combo-row__remove', {
                                                'combo-row__remove--disabled': rows.length === 1,
                                            })}
                                            onClick={() => removeRow(row.id)}
                                            disabled={rows.length === 1}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </ThemedScrollbars>
                    </div>

                    {/* Summary Panel */}
                    <div className='combo-summary'>
                        <div className='combo-summary__card'>
                            <h3 className='combo-summary__title'>
                                <Localize i18n_default_text='Combo Summary' />
                            </h3>

                            <div className='combo-summary__stats'>
                                <div className='combo-summary__stat'>
                                    <span className='combo-summary__stat-label'>
                                        <Localize i18n_default_text='Total Trades' />
                                    </span>
                                    <span className='combo-summary__stat-value'>{rows.length}</span>
                                </div>
                                <div className='combo-summary__stat'>
                                    <span className='combo-summary__stat-label'>
                                        <Localize i18n_default_text='Total Stake' />
                                    </span>
                                    <span className='combo-summary__stat-value combo-summary__stat-value--primary'>
                                        ${totalStake.toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            {rows.length > 0 && (
                                <div className='combo-summary__list'>
                                    {rows.map(r => (
                                        <div key={r.id} className='combo-summary__item'>
                                            <span className='combo-summary__item-name'>
                                                {r.market || '—'} • {r.tradeType || '—'}
                                                {(r.tradeType === 'Over' || r.tradeType === 'Under') &&
                                                    r.barrier &&
                                                    ` @ ${r.barrier}`}
                                            </span>
                                            <span className='combo-summary__item-stake'>
                                                ${(Number(r.stake) || 0).toFixed(2)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <Button
                                onClick={executeCombo}
                                disabled={validRows.length === 0 || isExecuting}
                                primary
                                className='combo-summary__execute-btn'
                            >
                                {isExecuting ? (
                                    <Localize i18n_default_text='Executing...' />
                                ) : (
                                    <Localize i18n_default_text='Execute Combo Trades' />
                                )}
                            </Button>
                        </div>

                        {/* Status indicator when bot is running */}
                        {is_running && (
                            <div className='combo-summary__status'>
                                <div className='combo-summary__status-active'>
                                    <span className='combo-summary__status-dot' />
                                    <Localize i18n_default_text='Trading in progress' />
                                </div>
                                {total_stake > 0 && (
                                    <div className='combo-summary__status-info'>
                                        <span>
                                            <Localize i18n_default_text='Total stake:' />{' '}
                                            <Money amount={total_stake} currency={currency} />
                                        </span>
                                        {total_profit !== 0 && (
                                            <span
                                                className={classNames('', {
                                                    'text-profit': total_profit > 0,
                                                    'text-loss': total_profit < 0,
                                                })}
                                            >
                                                <Money
                                                    amount={total_profit}
                                                    currency={currency}
                                                    has_sign
                                                    show_currency
                                                />
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

export default Combo;
