import { createContext, useContext } from "react";

export const StudyCtx = createContext(null);
export const useStudy = () => useContext(StudyCtx);
