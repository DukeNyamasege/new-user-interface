import React, { useEffect, useState } from 'react';
import { MOCK_TRADE_LOGS } from '../mock-data';
import { TBot, TTradeLog } from '../types';

type TBotLoaderProps = { bot: TBot; onBack: () => void };

const BotLoader = ({ bot, onBack }: TBotLoaderProps) => {
    const [isRunning, setIsRunning] = useState(false);
    const [balance, setBalance] = useState(1000.0);
    const [profit, setProfit] = useState(0);
    const [wins, setWins] = useState(0);
    const [losses, setLosses] = useState(0);
    const [logs, setLogs] = useState<TTradeLog[]>([]);
    const [logIdx, setLogIdx] = useState(0);

    useEffect(() => {
        if (!isRunning) return;
        const interval = setInterval(() => {
            const log = MOCK_TRADE_LOGS[logIdx % MOCK_TRADE_LOGS.length];
            const newLog = { ...log, id: `${Date.now()}`, time: new Date().toLocaleTimeString() };
            setLogs(prev => [newLog, ...prev].slice(0, 20));
            setProfit(prev => parseFloat((prev + newLog.profit).toFixed(2)));
            setBalance(prev => parseFloat((prev + newLog.profit).toFixed(2)));
            if (newLog.result === 'Win') setWins(w => w + 1);
            else setLosses(l => l + 1);
            setLogIdx(i => i + 1);
        }, 2000);
        return () => clearInterval(interval);
    }, [isRunning, logIdx]);

    const handleStop = () => {
        setIsRunning(false);
    };
    const handleReset = () => {
        setBalance(1000);
        setProfit(0);
        setWins(0);
        setLosses(0);
        setLogs([]);
        setLogIdx(0);
    };
    const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

    return (
        <div className='bi-loader'>
            <div className='bi-loader__topbar'>
                <button className='bi-btn bi-btn--ghost bi-btn--sm' onClick={onBack}>
                    ← Back
                </button>
                <div className='bi-loader__bot-info'>
                    <div className='bi-loader__avatar'>{bot.name.charAt(0)}</div>
                    <div>
                        <div className='bi-loader__bot-name'>{bot.name}</div>
                        <div className='bi-loader__bot-meta'>
                            {bot.strategy} · {bot.market}
                        </div>
                    </div>
                </div>
                <div className={`bi-loader__status-dot ${isRunning ? 'bi-loader__status-dot--live' : ''}`}>
                    {isRunning ? '🟢 LIVE' : '⚫ IDLE'}
                </div>
            </div>

            <div className='bi-loader__stats-row'>
                {[
                    { label: 'Balance', value: `$${balance.toFixed(2)}`, color: '' },
                    {
                        label: 'Total P&L',
                        value: `${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`,
                        color: profit >= 0 ? 'bi-green' : 'bi-red',
                    },
                    { label: 'Wins', value: wins, color: 'bi-green' },
                    { label: 'Losses', value: losses, color: 'bi-red' },
                    { label: 'Win Rate', value: `${winRate}%`, color: winRate >= 60 ? 'bi-green' : 'bi-red' },
                ].map(s => (
                    <div key={s.label} className='bi-stat-card'>
                        <div className='bi-stat-card__label'>{s.label}</div>
                        <div className={`bi-stat-card__value ${s.color}`}>{s.value}</div>
                    </div>
                ))}
            </div>

            <div className='bi-loader__controls'>
                {!isRunning ? (
                    <button className='bi-btn bi-btn--start' onClick={() => setIsRunning(true)}>
                        ▶ Start Bot
                    </button>
                ) : (
                    <button className='bi-btn bi-btn--stop' onClick={handleStop}>
                        ⏹ Stop Bot
                    </button>
                )}
                <button className='bi-btn bi-btn--ghost' onClick={handleReset}>
                    ↺ Reset
                </button>
            </div>

            <div className='bi-loader__logs'>
                <div className='bi-logs__header'>
                    <span>📋 Live Trade Log</span>
                    <span className='bi-logs__count'>{logs.length} trades</span>
                </div>
                <div className='bi-logs__table-wrap'>
                    <table className='bi-logs__table'>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Contract</th>
                                <th>Stake</th>
                                <th>Result</th>
                                <th>P&L</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={5} className='bi-logs__empty'>
                                        Start the bot to see live trades…
                                    </td>
                                </tr>
                            )}
                            {logs.map(log => (
                                <tr key={log.id} className={log.result === 'Win' ? 'bi-log--win' : 'bi-log--loss'}>
                                    <td>{log.time}</td>
                                    <td>{log.contract}</td>
                                    <td>${log.stake.toFixed(2)}</td>
                                    <td>
                                        <span
                                            className={`bi-badge ${log.result === 'Win' ? 'bi-badge--active' : 'bi-badge--inactive'}`}
                                        >
                                            {log.result}
                                        </span>
                                    </td>
                                    <td className={log.profit >= 0 ? 'bi-green' : 'bi-red'}>
                                        {log.profit >= 0 ? '+' : ''}${log.profit.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default BotLoader;
