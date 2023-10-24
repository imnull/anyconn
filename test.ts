import { request } from './src'

request('https://www.news.cn').then(res => {
    console.log(res.data)
})
