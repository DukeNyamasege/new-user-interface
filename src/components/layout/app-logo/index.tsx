import { standalone_routes } from '@/components/shared';
import './app-logo.scss';

export const AppLogo = () => {
    return (
        <a className='app-header__logo' href={standalone_routes.deriv_com} target='_blank' rel='noreferrer'>
            <span className='app-header__logo-powered'>Powered by</span>
            <span className='app-header__logo-brand'>Deriv</span>
        </a>
    );
};
