import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import './dtrader.scss';

const DTrader = observer(() => {
    const { client, run_panel } = useStore();
    const { balance, currency, loginid, is_logged_in } = client;
    const { is_running } = run_panel;

    return (
        <div className='dtrader'>
            <div className='dtrader__header'>
                <h2>DTrader</h2>
                {is_logged_in && (
                    <div className='dtrader__account-info'>
                        <span className='dtrader__balance'>
                            {currency} {balance}
                        </span>
                        <span className='dtrader__loginid'>{loginid}</span>
                    </div>
                )}
            </div>

            <div className='dtrader__content'>
                <div className='dtrader__placeholder'>
                    <p>DTrader integration coming soon...</p>
                    <p>Using existing auth scopes: {is_logged_in ? 'Connected' : 'Not connected'}</p>
                    <p>Bot running: {is_running ? 'Yes' : 'No'}</p>
                </div>
            </div>
        </div>
    );
});

export default DTrader;
