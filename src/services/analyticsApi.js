import { apiRequest } from '@/lib/apiClient'
import { queryString } from '@/lib/queryString'

export const getWeek = async (start) => (await apiRequest(`/week${queryString({ start })}`)).data
export const getAnalytics = async (params) => (await apiRequest(`/analytics${queryString(params)}`)).data
