import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './index';

/**
 * @description Pre-typed useDispatch hook for the app
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();

/**
 * @description Pre-typed useSelector hook for the app
 */
export const useAppSelector = useSelector.withTypes<RootState>();
