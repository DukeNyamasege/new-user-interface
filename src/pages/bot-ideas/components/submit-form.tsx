import React, { useState } from 'react';
import { TBotIdea, TRiskLevel } from '../types';

const MARKETS = [
    'Volatility 10',
    'Volatility 25',
    'Volatility 50',
    'Volatility 75',
    'Volatility 100',
    'Boom 300',
    'Boom 500',
    'Boom 1000',
    'Crash 300',
    'Crash 500',
    'Crash 1000',
    'Step Index',
    'Range Break 100',
    'Range Break 200',
];

const RISK_OPTIONS: { value: TRiskLevel; emoji: string; desc: string }[] = [
    { value: 'Low', emoji: '🟢', desc: 'Safe, slow growth' },
    { value: 'Medium', emoji: '🟡', desc: 'Balanced risk/reward' },
    { value: 'High', emoji: '🔴', desc: 'Aggressive, high reward' },
];

const EMPTY: TBotIdea = { name: '', strategy: '', market: MARKETS[0], risk: 'Medium', logic: '' };

const SubmitForm = () => {
    const [form, setForm] = useState<TBotIdea>(EMPTY);
    const [submitted, setSubmitted] = useState(false);

    const set = (field: keyof TBotIdea, value: string) => setForm(prev => ({ ...prev, [field]: value }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitted(true);
        setTimeout(() => {
            setSubmitted(false);
            setForm(EMPTY);
        }, 3000);
    };

    if (submitted) {
        return (
            <div className='bi-submit__success'>
                <div className='bi-submit__success-icon'>🚀</div>
                <h2>Idea Submitted!</h2>
                <p>{"We'll"} review your bot idea and add it to the library if it passes our strategy checks.</p>
            </div>
        );
    }

    return (
        <div className='bi-submit'>
            <div className='bi-submit__header'>
                <h2 className='bi-submit__title'>💡 Pitch Your Bot Idea</h2>
                <p className='bi-submit__subtitle'>Got a trading strategy in mind? Submit it and {"we'll"} build it.</p>
            </div>

            <form className='bi-submit__form' onSubmit={handleSubmit}>
                <div className='bi-form-row bi-form-row--2col'>
                    <div className='bi-field'>
                        <label className='bi-label'>Bot Name</label>
                        <input
                            className='bi-input'
                            placeholder='e.g. Boom Spike Hunter'
                            value={form.name}
                            onChange={e => set('name', e.target.value)}
                            required
                        />
                    </div>
                    <div className='bi-field'>
                        <label className='bi-label'>Strategy Type</label>
                        <input
                            className='bi-input'
                            placeholder='e.g. Trend Following, Martingale'
                            value={form.strategy}
                            onChange={e => set('strategy', e.target.value)}
                            required
                        />
                    </div>
                </div>

                <div className='bi-field'>
                    <label className='bi-label'>Market</label>
                    <select className='bi-select' value={form.market} onChange={e => set('market', e.target.value)}>
                        {MARKETS.map(m => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </select>
                </div>

                <div className='bi-field'>
                    <label className='bi-label'>Risk Level</label>
                    <div className='bi-risk-selector'>
                        {RISK_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                type='button'
                                className={`bi-risk-card ${form.risk === opt.value ? 'bi-risk-card--selected' : ''}`}
                                onClick={() => set('risk', opt.value)}
                            >
                                <span className='bi-risk-card__emoji'>{opt.emoji}</span>
                                <span className='bi-risk-card__label'>{opt.value}</span>
                                <span className='bi-risk-card__desc'>{opt.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className='bi-field'>
                    <label className='bi-label'>Expected Logic / Strategy Description</label>
                    <textarea
                        className='bi-textarea'
                        rows={5}
                        placeholder='Describe how your bot should work. Entry conditions, exit rules, stake size logic, etc.'
                        value={form.logic}
                        onChange={e => set('logic', e.target.value)}
                        required
                    />
                </div>

                <button className='bi-btn bi-btn--primary bi-btn--lg bi-btn--full' type='submit'>
                    🚀 Submit Bot Idea
                </button>
            </form>
        </div>
    );
};

export default SubmitForm;
