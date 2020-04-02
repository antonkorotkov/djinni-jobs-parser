import * as cheerio from 'cheerio'
import * as md5 from 'md5'
import { Schema } from 'mongoose'
import { ObjectId } from 'mongodb'

export const jobSchema = new Schema({
  title: String,
  description: String,
  experience: String,
  englishLevel: String,
  location: String,
  details: String,
  companyDetails: String,
  companyUrl: String
})

export class Job {
  public _id: ObjectId
  public title: string
  public description: string
  public experience: string
  public englishLevel: string
  public location: string
  public details: string
  public companyDetails: string
  public companyUrl: string

  constructor(job: CheerioElement) {
    this._id = new ObjectId(md5(cheerio('.profile', job).attr('href')).slice(0, 12))
    this.title = cheerio('.profile', job).text()
    this.description = cheerio('.list-jobs__description p', job).text()
    cheerio('.list-jobs__details__info nobr', job).each((i: number, e: CheerioElement) => {
      switch(i) {
        case 0: 
          this.experience = cheerio(e).text().trim()
          break;
        case 1: 
          this.englishLevel = cheerio(e).text();
      }
    }).remove()
    this.location = cheerio('.list-jobs__details__info i', job)[0].next.data.replace('·', '').trim() || ''
  }
}