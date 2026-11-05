/** Mulberry32: a tiny seeded PRNG so the demo school is the same every time it is provisioned. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!,
    chance: (p: number) => next() < p,
    shuffle: <T>(list: readonly T[]): T[] => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}
export type Rng = ReturnType<typeof rng>;

export const FIRST_FEMALE = ['Aadhya', 'Anika', 'Diya', 'Myra', 'Sara', 'Kiara', 'Ishita', 'Navya', 'Riya', 'Saanvi', 'Tara', 'Zoya', 'Aanya', 'Meher', 'Pari', 'Sana', 'Vanya', 'Avni', 'Ira', 'Kavya', 'Mahi', 'Nisha', 'Prisha', 'Rhea', 'Shreya', 'Trisha', 'Anvi', 'Charvi', 'Esha', 'Gauri'];
export const FIRST_MALE = ['Aarav', 'Kabir', 'Vivaan', 'Ishaan', 'Arnav', 'Rohan', 'Reyansh', 'Advait', 'Dev', 'Hriday', 'Neil', 'Om', 'Parth', 'Sahil', 'Veer', 'Yash', 'Aryan', 'Dhruv', 'Kian', 'Laksh', 'Manan', 'Nikhil', 'Rudra', 'Shaurya', 'Tanay', 'Utkarsh', 'Vihaan', 'Zayan', 'Atharv', 'Daksh'];
export const LAST = ['Sharma', 'Mehta', 'Singh', 'Kapoor', 'Joshi', 'Rao', 'Gupta', 'Khan', 'Nair', 'Patel', 'Iyer', 'Verma', 'Desai', 'Kumar', 'Gokhale', 'Das', 'Kulkarni', 'Pillai', 'Bhatt', 'Chopra', 'Deshmukh', 'Fernandes', 'Ghosh', 'Hegde', 'Jain', 'Kamat', 'Lal', 'Menon', 'Naik', 'Oberoi', 'Pandey', 'Reddy', 'Saxena', 'Thakur', 'Wagh', 'Yadav'];
export const HOUSES = ['Emerald', 'Ruby', 'Sapphire', 'Amber'] as const;
export const BLOOD = ['A+', 'B+', 'O+', 'AB+', 'A-', 'B-', 'O-'] as const;
export const AREAS = ['Baner', 'Aundh', 'Wakad', 'Balewadi', 'Pashan', 'Kothrud', 'Hinjewadi', 'Sus'] as const;
