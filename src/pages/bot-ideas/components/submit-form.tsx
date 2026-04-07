import { useRef, useState } from 'react';
import { TBotIdea, TNotification } from '../types';

const STORAGE_KEY = 'bot_pitch_ideas';

type TBotPitchFormProps = {
    onIdeaSubmitted: (idea: TBotIdea) => void;
};

const BotPitchForm = ({ onIdeaSubmitted }: TBotPitchFormProps) => {
    const [botName, setBotName] = useState('');
    const [strategy, setStrategy] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const autoResize = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto'; // collapse first so shrinking also works
        el.style.height = `${el.scrollHeight}px`;
    };
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [notification, setNotification] = useState<TNotification | null>(null);

    const showNotification = (n: TNotification) => {
        setNotification(n);
        setTimeout(() => setNotification(null), 5000);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            // ── Replace with Supabase call when ready ──────────────────────
            // const { error } = await supabase.from('bot_ideas').insert([{ bot_name: botName, strategy_description: strategy }]);
            // if (error) throw error;
            // ──────────────────────────────────────────────────────────────
            const newIdea: TBotIdea = {
                id: `${Date.now()}`,
                bot_name: botName,
                strategy_description: strategy,
                submitted_at: new Date().toISOString(),
            };
            const existing: TBotIdea[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
            localStorage.setItem(STORAGE_KEY, JSON.stringify([newIdea, ...existing]));

            setBotName('');
            setStrategy('');
            showNotification({ type: 'success', message: 'Bot idea submitted successfully!' });
            onIdeaSubmitted(newIdea);
        } catch {
            showNotification({ type: 'error', message: 'Failed to submit. Please try again.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className='bpf'>
            <div className='bpf__card'>
                <h2 className='bpf__title'>Describe your bot idea</h2>
                <p className='bpf__subtitle'></p>

                {notification && (
                    <div className={`bpf__notification bpf__notification--${notification.type}`}>
                        {notification.message}
                    </div>
                )}

                <form className='bpf__form' onSubmit={handleSubmit}>
                    <div className='bpf__field'>
                        <label className='bpf__label' htmlFor='bot_name'>
                            Bot Name
                        </label>
                        <input
                            id='bot_name'
                            className='bpf__input'
                            type='text'
                            placeholder=''
                            value={botName}
                            onChange={e => setBotName(e.target.value)}
                            required
                        />
                    </div>

                    <div className='bpf__field'>
                        <label className='bpf__label' htmlFor='strategy_description'>
                            Strategy Description
                        </label>
                        <textarea
                            ref={textareaRef}
                            id='strategy_description'
                            className='bpf__textarea'
                            placeholder=''
                            rows={4}
                            value={strategy}
                            onChange={e => {
                                setStrategy(e.target.value);
                                autoResize();
                            }}
                            required
                        />
                    </div>

                    <button className='bpf__submit' type='submit' disabled={isSubmitting}>
                        {isSubmitting ? 'Submitting…' : '→ Submit Idea'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default BotPitchForm;
