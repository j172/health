export interface PetAdoptionItem {
  id: number;
  animal_id: number;
  animal_subid: string | null;
  animal_kind: string;
  animal_variety: string | null;
  animal_sex: string;
  animal_bodytype: string | null;
  animal_colour: string | null;
  animal_age: string | null;
  animal_sterilization: string | null;
  animal_bacterin: string | null;
  animal_foundplace: string | null;
  animal_status: string | null;
  animal_remark: string | null;
  animal_opendate: string | null;
  album_file: string | null;
  shelter_name: string | null;
  shelter_address: string | null;
  shelter_tel: string | null;
  city: string | null;
}

export interface PetAdoptionFilterParams {
  kind?: string;
  sex?: string;
  bodytype?: string;
  city?: string;
  keyword?: string;
  page?: number;
  limit?: number;
}
