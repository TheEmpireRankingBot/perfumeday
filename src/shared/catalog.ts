import type { DayPart, FragranceProfile, ManualFragranceInput, Occasion, Vibe } from './types';

const occasion = (values: number[]): Record<Occasion, number> => ({
  Work: values[0], Casual: values[1], Date: values[2], 'Night out': values[3], Sport: values[4], Special: values[5],
});
const dayPart = (values: number[]): Record<DayPart, number> => ({
  morning: values[0], afternoon: values[1], evening: values[2], night: values[3],
});
const vibe = (values: number[]): Record<Vibe, number> => ({
  Balanced: values[0], Fresh: values[1], Confident: values[2], Calm: values[3], Statement: values[4],
});

export const CATALOG_VERSION = '2026-07-14.1';

export const STARTER_CATALOG: FragranceProfile[] = [
  {
    id: 'lv-imagination', house: 'Louis Vuitton', name: 'Imagination', edition: 'Eau de Parfum',
    summary: 'Polished citrus, ginger and airy black tea with an amber trail.',
    accords: ['citrus', 'tea', 'ginger', 'fresh spicy', 'amber'], sourceConfidence: 'curated',
    traits: { freshness: 9, sweetness: 4, intensity: 7, projection: 7, longevity: 8, formality: 8, indoorSafety: 8 },
    climate: { idealMinC: 23, idealMaxC: 34, toleranceMinC: 15, toleranceMaxC: 38, humidityTolerance: 9, rainAffinity: 6 },
    occasionFit: occasion([9, 9, 8, 7, 7, 8]), dayPartFit: dayPart([10, 9, 8, 7]), vibeFit: vibe([10, 10, 8, 8, 7]),
    sprays: { hot: '3 sprays — chest and back of neck', mild: '4 sprays — chest, neck and wrist', cool: '5 sprays — chest and neck' },
  },
  {
    id: 'bujairami-psycho', house: 'Bujairami', name: 'Psycho', edition: 'Extrait de Parfum',
    summary: 'A vivid grapefruit and bergamot burst sharpened by ginger.',
    accords: ['grapefruit', 'bergamot', 'ginger', 'citrus', 'fresh spicy'], sourceConfidence: 'curated',
    traits: { freshness: 10, sweetness: 3, intensity: 8, projection: 8, longevity: 8, formality: 5, indoorSafety: 6 },
    climate: { idealMinC: 25, idealMaxC: 36, toleranceMinC: 19, toleranceMaxC: 39, humidityTolerance: 9, rainAffinity: 6 },
    occasionFit: occasion([7, 9, 7, 8, 9, 6]), dayPartFit: dayPart([9, 10, 7, 7]), vibeFit: vibe([8, 10, 9, 5, 9]),
    sprays: { hot: '2 sprays — chest and back of neck', mild: '3 sprays — chest and neck', cool: '4 sprays — chest and neck' },
  },
  {
    id: 'vca-moonlight-patchouli', house: 'Van Cleef & Arpels', name: 'Moonlight Patchouli', edition: 'Eau de Parfum',
    summary: 'Elegant patchouli, rose and leather with a dark woody finish.',
    accords: ['patchouli', 'woody', 'rose', 'leather', 'powdery'], sourceConfidence: 'curated',
    traits: { freshness: 3, sweetness: 5, intensity: 7, projection: 7, longevity: 8, formality: 9, indoorSafety: 5 },
    climate: { idealMinC: 15, idealMaxC: 27, toleranceMinC: 10, toleranceMaxC: 31, humidityTolerance: 4, rainAffinity: 8 },
    occasionFit: occasion([6, 5, 9, 9, 1, 10]), dayPartFit: dayPart([4, 5, 9, 10]), vibeFit: vibe([6, 2, 9, 7, 10]),
    sprays: { hot: '1–2 sprays — under clothing', mild: '3 sprays — chest and neck', cool: '4 sprays — chest, neck and wrist' },
  },
  {
    id: 'dior-lucky', house: 'Dior', name: 'Lucky', edition: 'Maison Christian Dior Eau de Parfum',
    summary: 'Luminous lily-of-the-valley with soft white florals and clean musk.',
    accords: ['white floral', 'green', 'fresh', 'ozonic', 'musky'], sourceConfidence: 'curated',
    traits: { freshness: 8, sweetness: 3, intensity: 5, projection: 5, longevity: 6, formality: 8, indoorSafety: 10 },
    climate: { idealMinC: 20, idealMaxC: 33, toleranceMinC: 14, toleranceMaxC: 36, humidityTolerance: 8, rainAffinity: 7 },
    occasionFit: occasion([10, 8, 8, 5, 5, 9]), dayPartFit: dayPart([10, 9, 7, 5]), vibeFit: vibe([9, 9, 6, 10, 4]),
    sprays: { hot: '4 sprays — chest, neck and wrists', mild: '5 sprays — chest, neck and wrists', cool: '6 sprays — skin and clothing' },
  },
  {
    id: 'dior-homme', house: 'Dior', name: 'Dior Homme', edition: '2020 Eau de Toilette',
    summary: 'Clean modern woods, citrus and musk with tailored versatility.',
    accords: ['woody', 'citrus', 'musky', 'amber', 'aromatic'], sourceConfidence: 'provisional', needsConfirmation: true,
    traits: { freshness: 6, sweetness: 3, intensity: 6, projection: 6, longevity: 7, formality: 9, indoorSafety: 8 },
    climate: { idealMinC: 17, idealMaxC: 30, toleranceMinC: 11, toleranceMaxC: 34, humidityTolerance: 6, rainAffinity: 7 },
    occasionFit: occasion([10, 8, 9, 8, 4, 9]), dayPartFit: dayPart([8, 8, 9, 8]), vibeFit: vibe([10, 6, 9, 7, 7]),
    sprays: { hot: '3 sprays — chest and back of neck', mild: '4 sprays — chest and neck', cool: '5 sprays — chest, neck and wrist' },
  },
  {
    id: 'chanel-allure-homme-sport', house: 'Chanel', name: 'Allure Homme Sport', edition: 'Eau de Toilette',
    summary: 'Bright mandarin, marine freshness and creamy woods with sporty polish.',
    accords: ['citrus', 'aromatic', 'marine', 'woody', 'vanilla'], sourceConfidence: 'provisional', needsConfirmation: true,
    traits: { freshness: 9, sweetness: 5, intensity: 7, projection: 7, longevity: 7, formality: 7, indoorSafety: 7 },
    climate: { idealMinC: 21, idealMaxC: 34, toleranceMinC: 14, toleranceMaxC: 37, humidityTolerance: 8, rainAffinity: 6 },
    occasionFit: occasion([8, 10, 8, 8, 10, 6]), dayPartFit: dayPart([9, 10, 8, 7]), vibeFit: vibe([9, 10, 9, 6, 8]),
    sprays: { hot: '3 sprays — chest and back of neck', mild: '4 sprays — chest, neck and wrist', cool: '5 sprays — chest and neck' },
  },
  {
    id: 'armani-acqua-di-gio', house: 'Giorgio Armani', name: 'Acqua di Giò', edition: 'Eau de Toilette',
    summary: 'Sea air, citrus and aromatic herbs over a transparent woody base.',
    accords: ['aquatic', 'marine', 'citrus', 'aromatic', 'fresh spicy'], sourceConfidence: 'provisional', needsConfirmation: true,
    traits: { freshness: 10, sweetness: 2, intensity: 5, projection: 5, longevity: 5, formality: 6, indoorSafety: 10 },
    climate: { idealMinC: 24, idealMaxC: 37, toleranceMinC: 18, toleranceMaxC: 40, humidityTolerance: 10, rainAffinity: 8 },
    occasionFit: occasion([9, 10, 7, 5, 10, 5]), dayPartFit: dayPart([10, 10, 7, 5]), vibeFit: vibe([9, 10, 7, 9, 4]),
    sprays: { hot: '5 sprays — chest, neck and forearms', mild: '6 sprays — skin and clothing', cool: '7 sprays — skin and clothing' },
  },
  {
    id: 'le-labo-santal-33', house: 'Le Labo', name: 'Santal 33', edition: 'Eau de Parfum',
    summary: 'Dry sandalwood, cardamom and leather with an unmistakable airy trail.',
    accords: ['woody', 'leather', 'warm spicy', 'powdery', 'violet'], sourceConfidence: 'curated',
    traits: { freshness: 4, sweetness: 2, intensity: 8, projection: 8, longevity: 9, formality: 8, indoorSafety: 5 },
    climate: { idealMinC: 14, idealMaxC: 29, toleranceMinC: 8, toleranceMaxC: 33, humidityTolerance: 5, rainAffinity: 8 },
    occasionFit: occasion([6, 8, 9, 9, 2, 9]), dayPartFit: dayPart([6, 7, 9, 9]), vibeFit: vibe([7, 3, 9, 7, 10]),
    sprays: { hot: '1–2 sprays — under clothing', mild: '3 sprays — chest and back of neck', cool: '4 sprays — chest, neck and wrist' },
  },
  {
    id: 'loe-white-shirts', house: 'LOE', name: 'White Shirts', edition: 'Eau de Toilette',
    summary: 'Fresh laundry florals, white soap, soft musk and clean vetiver.',
    accords: ['fresh', 'floral', 'soapy', 'white musk', 'vetiver'], sourceConfidence: 'curated',
    traits: { freshness: 9, sweetness: 2, intensity: 3, projection: 3, longevity: 4, formality: 7, indoorSafety: 10 },
    climate: { idealMinC: 21, idealMaxC: 35, toleranceMinC: 16, toleranceMaxC: 38, humidityTolerance: 9, rainAffinity: 7 },
    occasionFit: occasion([10, 9, 6, 3, 8, 6]), dayPartFit: dayPart([10, 10, 7, 4]), vibeFit: vibe([9, 10, 5, 10, 2]),
    sprays: { hot: '5 sprays — chest, neck and clothing', mild: '6 sprays — skin and clothing', cool: '7 sprays — skin and clothing' },
  },
  {
    id: 'soulvent-pilgrims-path', house: 'Soulvent', name: 'Pilgrim’s Path', edition: 'Eau de Parfum',
    summary: 'Green conifers, black tea and birch settling into tobacco and incense.',
    accords: ['aromatic', 'woody', 'green', 'smoky', 'tobacco'], sourceConfidence: 'curated',
    traits: { freshness: 4, sweetness: 2, intensity: 7, projection: 7, longevity: 8, formality: 8, indoorSafety: 4 },
    climate: { idealMinC: 12, idealMaxC: 26, toleranceMinC: 7, toleranceMaxC: 30, humidityTolerance: 3, rainAffinity: 10 },
    occasionFit: occasion([5, 7, 9, 10, 2, 10]), dayPartFit: dayPart([5, 6, 9, 10]), vibeFit: vibe([6, 3, 9, 8, 10]),
    sprays: { hot: '1 spray — under clothing', mild: '2–3 sprays — chest and back of neck', cool: '4 sprays — chest and neck' },
  },
  {
    id: 'montblanc-explorer', house: 'Montblanc', name: 'Explorer', edition: 'Eau de Parfum',
    summary: 'Bergamot, aromatic woods and leather with an easy confident character.',
    accords: ['woody', 'aromatic', 'citrus', 'leather', 'earthy'], sourceConfidence: 'curated',
    traits: { freshness: 6, sweetness: 3, intensity: 7, projection: 7, longevity: 7, formality: 7, indoorSafety: 7 },
    climate: { idealMinC: 17, idealMaxC: 31, toleranceMinC: 11, toleranceMaxC: 35, humidityTolerance: 6, rainAffinity: 7 },
    occasionFit: occasion([8, 9, 8, 8, 5, 7]), dayPartFit: dayPart([8, 8, 8, 8]), vibeFit: vibe([9, 6, 10, 6, 8]),
    sprays: { hot: '3 sprays — chest and back of neck', mild: '4 sprays — chest and neck', cool: '5 sprays — chest, neck and wrist' },
  },
];

export const createStarterCollection = (now = new Date()): import('./types').CollectionItem[] =>
  STARTER_CATALOG.map((profile, index) => ({
    id: `starter-${index + 1}`,
    profileId: profile.id,
    active: true,
    addedAt: new Date(now.getTime() + index).toISOString(),
  }));

export const findProfile = (id: string) => STARTER_CATALOG.find((profile) => profile.id === id);

export function createManualProfile(input: ManualFragranceInput, id: string): FragranceProfile {
  const accords = input.accords.map((accord) => accord.trim().toLowerCase()).filter(Boolean).slice(0, 8);
  return {
    id,
    house: input.house.trim() || 'Unknown house',
    name: input.name.trim(),
    edition: input.edition.trim() || 'Edition to confirm',
    summary: 'Manually added fragrance with a conservative provisional scoring profile.',
    accords: accords.length ? accords : ['aromatic', 'woody', 'fresh'],
    sourceConfidence: 'provisional',
    needsConfirmation: true,
    traits: { freshness: 5, sweetness: 5, intensity: 5, projection: 5, longevity: 5, formality: 5, indoorSafety: 6 },
    climate: { idealMinC: 18, idealMaxC: 31, toleranceMinC: 10, toleranceMaxC: 36, humidityTolerance: 6, rainAffinity: 5 },
    occasionFit: occasion([6, 7, 6, 6, 4, 6]),
    dayPartFit: dayPart([6, 7, 7, 6]),
    vibeFit: vibe([7, 5, 6, 5, 5]),
    sprays: { hot: '2 sprays — adjust after testing', mild: '3 sprays — adjust after testing', cool: '4 sprays — adjust after testing' },
  };
}
