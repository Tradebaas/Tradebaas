import * as icons from '@phosphor-icons/react';
console.log('Total exports:', Object.keys(icons).length);
console.log('Alert icons:', Object.keys(icons).filter(k => k.includes('Alert')).slice(0, 10));
console.log('Has AlertTriangle?', 'AlertTriangle' in icons);
