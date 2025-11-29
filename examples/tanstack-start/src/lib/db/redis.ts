/**
 * Redis 数据访问层
 */

import Redis from 'ioredis'

// Redis 连接单例
let redisInstance: Redis | null = null

export function getRedis(): Redis {
  if (!redisInstance) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
    redisInstance = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
    
    redisInstance.on('error', (error) => {
      console.error('[Redis] Connection error:', error)
    })
    
    redisInstance.on('connect', () => {
      console.log('[Redis] Connected successfully')
    })
  }
  
  return redisInstance
}

// 数据类型定义
export interface Booking {
  id: string
  machineId: string
  ssoUsername: string  // SSO 用户名
  displayName: string
  startTime: number
  endTime: number
  mode: 'exclusive' | 'shared'
  status: 'pending' | 'active' | 'expired' | 'cancelled'
  createdAt: number
  accessGrantedAt?: number
}

export interface Machine {
  id: string
  name: string
  description: string
  status: 'available' | 'maintenance' | 'offline'
  intro?: string
  specs: {
    gpu: string
    cpu: string
    ram: string
    storage: string
    network: string
  }
  maxSharedUsers: number
  ansible_host: string
  ansible_user: string
  ipmi_host: string
  ipmi_user: string
  ipmi_password: string
  access_group: string  // 如 'machine-access-cse-ai-1'
}

/**
 * Booking 数据库操作
 */
export const bookingDB = {
  /**
   * 创建预订
   */
  async create(booking: Omit<Booking, 'id' | 'createdAt'>): Promise<string> {
    const redis = getRedis()
    const id = `booking-${Date.now()}-${Math.random().toString(36).substring(7)}`
    
    const bookingData: Booking = {
      ...booking,
      id,
      createdAt: Date.now()
    }
    
    // 存储预订详情
    await redis.hset(`bookings:${id}`, bookingData as any)
    
    // 添加到机器的预订索引（按开始时间排序）
    await redis.zadd(
      `machine:${booking.machineId}:bookings`,
      booking.startTime,
      id
    )
    
    // 添加到用户的预订索引
    await redis.sadd(`user:${booking.ssoUsername}:bookings`, id)
    
    return id
  },
  
  /**
   * 获取预订详情
   */
  async get(bookingId: string): Promise<Booking | null> {
    const redis = getRedis()
    const data = await redis.hgetall(`bookings:${bookingId}`)
    
    if (!data || Object.keys(data).length === 0) {
      return null
    }
    
    return {
      ...data,
      startTime: Number(data.startTime),
      endTime: Number(data.endTime),
      createdAt: Number(data.createdAt),
      accessGrantedAt: data.accessGrantedAt ? Number(data.accessGrantedAt) : undefined
    } as Booking
  },
  
  /**
   * 更新预订
   */
  async update(bookingId: string, data: Partial<Booking>): Promise<void> {
    const redis = getRedis()
    await redis.hset(`bookings:${bookingId}`, data as any)
  },
  
  /**
   * 删除预订
   */
  async delete(bookingId: string): Promise<void> {
    const redis = getRedis()
    const booking = await this.get(bookingId)
    
    if (booking) {
      // 删除预订详情
      await redis.del(`bookings:${bookingId}`)
      
      // 从机器索引中删除
      await redis.zrem(`machine:${booking.machineId}:bookings`, bookingId)
      
      // 从用户索引中删除
      await redis.srem(`user:${booking.ssoUsername}:bookings`, bookingId)
    }
  },
  
  /**
   * 获取机器的所有预订
   */
  async getByMachine(machineId: string): Promise<Booking[]> {
    const redis = getRedis()
    const bookingIds = await redis.zrange(`machine:${machineId}:bookings`, 0, -1)
    
    const bookings = await Promise.all(
      bookingIds.map(id => this.get(id))
    )
    
    return bookings.filter(b => b !== null) as Booking[]
  },
  
  /**
   * 获取用户的所有预订
   */
  async getByUser(ssoUsername: string): Promise<Booking[]> {
    const redis = getRedis()
    const bookingIds = await redis.smembers(`user:${ssoUsername}:bookings`)
    
    const bookings = await Promise.all(
      bookingIds.map(id => this.get(id))
    )
    
    return bookings.filter(b => b !== null) as Booking[]
  },
  
  /**
   * 获取所有 active 的预订
   */
  async getActive(): Promise<Booking[]> {
    const redis = getRedis()
    const keys = await redis.keys('bookings:*')
    
    const bookings = await Promise.all(
      keys.map(async key => {
        const id = key.replace('bookings:', '')
        return this.get(id)
      })
    )
    
    return bookings.filter(b => b !== null && b.status === 'active') as Booking[]
  },
  
  /**
   * 获取所有预订
   */
  async getAll(): Promise<Booking[]> {
    const redis = getRedis()
    const keys = await redis.keys('bookings:*')
    
    const bookings = await Promise.all(
      keys.map(async key => {
        const id = key.replace('bookings:', '')
        return this.get(id)
      })
    )
    
    return bookings.filter(b => b !== null) as Booking[]
  }
}

/**
 * Machine 数据库操作
 */
export const machineDB = {
  /**
   * 获取机器详情
   */
  async get(machineId: string): Promise<Machine | null> {
    const redis = getRedis()
    const data = await redis.hgetall(`machines:${machineId}`)
    
    if (!data || Object.keys(data).length === 0) {
      return null
    }
    
    return {
      ...data,
      specs: JSON.parse(data.specs || '{}'),
      maxSharedUsers: Number(data.maxSharedUsers)
    } as Machine
  },
  
  /**
   * 获取所有机器
   */
  async getAll(): Promise<Machine[]> {
    const redis = getRedis()
    const keys = await redis.keys('machines:*')
    
    const machines = await Promise.all(
      keys.map(async key => {
        const id = key.replace('machines:', '')
        return this.get(id)
      })
    )
    
    return machines.filter(m => m !== null) as Machine[]
  },
  
  /**
   * 创建或更新机器
   */
  async set(machine: Machine): Promise<void> {
    const redis = getRedis()
    const data = {
      ...machine,
      specs: JSON.stringify(machine.specs)
    }
    await redis.hset(`machines:${machine.id}`, data as any)
  },
  
  /**
   * 更新机器
   */
  async update(machineId: string, data: Partial<Machine>): Promise<void> {
    const redis = getRedis()
    const updateData = { ...data }
    if (updateData.specs) {
      (updateData as any).specs = JSON.stringify(updateData.specs)
    }
    await redis.hset(`machines:${machineId}`, updateData as any)
  }
}

