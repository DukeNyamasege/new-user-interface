import { observer } from 'mobx-react-lite';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import { LegacyThemeDarkIcon, LegacyThemeLightIcon } from '@deriv/quill-icons/Legacy';
import './mobile-menu.scss';

const ToggleButton = observer(() => {
    const { is_dark_mode_on, toggleTheme } = useThemeSwitcher();

    return (
        <button className='mobile-menu__theme-toggle' onClick={toggleTheme} aria-label='Toggle theme'>
            {is_dark_mode_on ? (
                <LegacyThemeDarkIcon iconSize='sm' fill='var(--text-general)' />
            ) : (
                <LegacyThemeLightIcon iconSize='sm' fill='var(--text-general)' />
            )}
        </button>
    );
});

export default ToggleButton;
