import { useDevice } from '@deriv-com/ui';
import ToggleButton from './toggle-button';
import './mobile-menu.scss';

const MobileMenu = () => {
    const { isDesktop } = useDevice();

    if (isDesktop) return null;

    return (
        <div className='mobile-menu'>
            <ToggleButton />
        </div>
    );
};

export default MobileMenu;
