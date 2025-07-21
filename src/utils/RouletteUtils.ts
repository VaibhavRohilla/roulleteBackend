/**
 * 🎰 Shared Roulette Utilities
 * Centralized logic for roulette number properties to avoid redundancy
 */

// European roulette red and black number sets
export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const BLACK_NUMBERS = new Set([2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]);

/**
 * Get the color of a roulette number
 * @param number - The roulette number (0-36)
 * @returns The color: 'Red', 'Black', or 'Green'
 */
export function getRouletteColor(number: number): string {
    if (!isValidRouletteNumber(number)) {
        throw new Error(`Invalid roulette number: ${number}. Must be 0-36.`);
    }
    
    if (RED_NUMBERS.has(number)) return 'Red';
    if (BLACK_NUMBERS.has(number)) return 'Black';
    return 'Green'; // Zero is green
}

/**
 * Get the parity (odd/even) of a roulette number
 * @param number - The roulette number (0-36)
 * @returns The parity: 'Odd', 'Even', or 'None' (for zero)
 */
export function getRouletteParity(number: number): string {
    if (!isValidRouletteNumber(number)) {
        throw new Error(`Invalid roulette number: ${number}. Must be 0-36.`);
    }
    
    if (number === 0) return 'None';
    return number % 2 === 0 ? 'Even' : 'Odd';
}

/**
 * Validate if a number is a valid roulette number
 * @param number - The number to validate
 * @returns True if valid (0-36), false otherwise
 */
export function isValidRouletteNumber(number: number): boolean {
    return Number.isInteger(number) && number >= 0 && number <= 36;
}

/**
 * Get complete roulette properties for a number
 * @param number - The roulette number (0-36)
 * @returns Object with number, color, and parity
 */
export function getRouletteProperties(number: number) {
    return {
        number,
        color: getRouletteColor(number),
        parity: getRouletteParity(number)
    };
}

/**
 * Check if a number is red
 * @param number - The roulette number
 * @returns True if the number is red
 */
export function isRedNumber(number: number): boolean {
    return RED_NUMBERS.has(number);
}

/**
 * Check if a number is black
 * @param number - The roulette number
 * @returns True if the number is black
 */
export function isBlackNumber(number: number): boolean {
    return BLACK_NUMBERS.has(number);
}

/**
 * Check if a number is green (zero)
 * @param number - The roulette number
 * @returns True if the number is green (zero)
 */
export function isGreenNumber(number: number): boolean {
    return number === 0;
} 