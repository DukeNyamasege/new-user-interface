import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

window.Blockly.Blocks.rise_fall_percentage = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('{{ direction }} %% of last {{ count }} ticks', {
                direction: '%1',
                count: '%2',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'DIRECTION',
                    options: [
                        [localize('Rise'), 'rise'],
                        [localize('Fall'), 'fall'],
                    ],
                },
                {
                    type: 'input_value',
                    name: 'COUNT',
                    check: 'Number',
                },
            ],
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            tooltip: localize('Returns the percentage of rising or falling ticks from the last N ticks'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('Rise/Fall %'),
            description: localize('Returns the percentage of rising or falling ticks from the last N ticks.'),
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.rise_fall_percentage = block => {
    const count =
        window.Blockly.JavaScript.javascriptGenerator.valueToCode(
            block,
            'COUNT',
            window.Blockly.JavaScript.javascriptGenerator.ORDER_NONE
        ) || 1000;
    const direction = block.getFieldValue('DIRECTION');
    const operator = direction === 'fall' ? '<' : '>';

    return [
        `(() => {
            const size = Math.max(2, Number(${count}) || 2);
            const ticks = Bot.getTicks(false).slice(-size).map(Number);
            if (ticks.length < 2) return 0;
            let matches = 0;
            for (let index = 1; index < ticks.length; index += 1) {
                if (ticks[index] ${operator} ticks[index - 1]) matches += 1;
            }
            return (matches / (ticks.length - 1)) * 100;
        })()`,
        window.Blockly.JavaScript.javascriptGenerator.ORDER_FUNCTION_CALL,
    ];
};
