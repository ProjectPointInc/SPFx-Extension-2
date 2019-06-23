import { override } from '@microsoft/decorators';
import { Log } from '@microsoft/sp-core-library';
import { BaseApplicationCustomizer, PlaceholderName, PlaceholderContent } from '@microsoft/sp-application-base';

declare var $: any;
require('jquery');
require('modal');

import { SPComponentLoader } from '@microsoft/sp-loader';

import {
  SPHttpClient,
  SPHttpClientResponse,
  //  SPHttpClientConfiguration,
  //  ISPHttpClientOptions
} from '@microsoft/sp-http';

//  change this to private properties?
export interface ISpfxExtensionApplicationCustomizerProperties {
  testMessage: string;
  userEmail: string;
  listName: string;
  itemId: number;
  url: string;
  redirectUrl: string;
}

export interface IListItem {
  Title?: string;
  // EmailAddress: string;
  Id: number;
  //CompletedEnrollment: boolean;
  EnrollmentCompleted: Date;
}
const LOG_SOURCE: string = 'SpfxExtensionApplicationCustomizer';
export default class SpfxExtensionApplicationCustomizer extends BaseApplicationCustomizer<ISpfxExtensionApplicationCustomizerProperties> {
  private _topPlaceholder: PlaceholderContent | undefined;

  private onDispose(): void {
    console.log('[HelloWorldApplicationCustomizer.onDispose] Disposed custom top and bottom placeholders.');
  }
  
  private showForm(): void {
    let formDiv: HTMLDivElement = document.createElement("div");
    formDiv.innerHTML = `
      <div id="ex1" class="modal">
        <input id="CompleteButton" type="button" value="Complete Enrollment" class="complete" />
        <input id="CancelButton" type="button" value="Cancel Enrollment" class="cancel" />
      </div>
      `;
    formDiv.querySelector('input.cancel').addEventListener('click', () => { this.FormCancel(); });  // error if not found
    formDiv.querySelector('input.complete').addEventListener('click', () => { this.FormSave(); });

    if (!this._topPlaceholder) {
      this._topPlaceholder = this.context.placeholderProvider.tryCreateContent(PlaceholderName.Top, { onDispose: this.onDispose });
      if (this._topPlaceholder.domElement) {
        this._topPlaceholder.domElement.appendChild(formDiv);
      }
    }

    $("#ex1").modal({
      escapeClose: false,
      clickClose: false,
      showClose: false,
      fadeDuration: 100
    });
  }

  private getLatestItemId(): Promise<number> {
    return new Promise<number>((resolve: (itemId: number) => void, reject: (error: any) => void): void => {
      this.context.spHttpClient.get(`${this.context.pageContext.web.absoluteUrl}/_api/web/lists/getbytitle('Enrollments')/items?$orderby=Id desc&$top=1&$select=id&$filter=UserEmail+eq+'${this.properties.userEmail}'+and+EnrollmentCompleted+eq+null`,
        SPHttpClient.configurations.v1,
        {
          headers: {
            'Accept': 'application/json;odata=nometadata',
            'odata-version': ''
          }
        })
        .then((response: SPHttpClientResponse): Promise<{ value: { Id: number }[] }> => {
          return response.json();
        })
        .then((response: { value: { Id: number }[] }): void => {
          if (response.value.length === 0) {
            resolve(-1);
          }
          else {
            resolve(response.value[0].Id);
          }
        });
    });
  }

  private insertJSFile(url: string): void {
    let head: any = document.getElementsByTagName("head")[0] || document.documentElement;
    let script: HTMLScriptElement = document.createElement("script");
    script.type = "text/javascript";
    script.src = url;
    head.appendChild(script);
    document.getElementsByTagName("head")[0].appendChild(script);
  }

  private updateStatus(status: string, items: IListItem[] = []): void {  
    //this.domElement.querySelector('.status').innerHTML = status;  
    //this.updateItemsHtml(items);  
    console.log(status);
  }  

  constructor() {
    super();
    SPComponentLoader.loadCss('https://cdnjs.cloudflare.com/ajax/libs/jquery-modal/0.9.1/jquery.modal.min.css');
  }

  @override
  public onInit(): Promise<void> {
    Log.info(LOG_SOURCE, "Initialized ");
    this.properties.url = this.context.pageContext.web.absoluteUrl;   
    this.properties.userEmail = this.context.pageContext.user.email.toString();    
    this.properties.listName = "Enrollments";   
    this.properties.redirectUrl = `{this.context.pageContext.web.absoluteUrl}/TPBC/SitePages/ThankYou.aspx`;

    this.insertJSFile(`${this.context.pageContext.web.absoluteUrl}/SiteAssets/js/site.js`);
    //  only run for external user
    if (this.context.pageContext.user.isExternalGuestUser || this.context.pageContext.user.isAnonymousGuestUser) {
      // do not run on Thank you page or enrollment form
      if ((document.location.href).toLowerCase().indexOf("thankyou.aspx") == -1 && (document.location.href).toLowerCase().indexOf("enrollment.aspx") == -1) {
      this.getLatestItemId().then((result) => {
        this.properties.itemId = result;
        if (this.properties.itemId > 0) {    //  only update probably should add new item   
          this.showForm();   /// displays form in modal
          //this.insertJSFile(`${this.properties.url}/SiteAssets/js/notEnrolled.js`);
        }
      })
        .catch((error: any) => {
          console.log(error);
          return true;  ///  log the error and return true so user can continue
        });
    }
  }
    return Promise.resolve();
  }

  public FormCancel(): void {
    //  add a modal close here so the user isnt left hanging
    $.modal.defaults = { closeExisting: true };
    $.modal.close();
    window.document.location.href = this.properties.redirectUrl;
  }

  public FormSave(): void {  
    let latestItemId: number = undefined;  
    this.updateStatus('Loading latest item...');  
    
    this.getLatestItemId()  
      .then((itemId: number): Promise<SPHttpClientResponse> => {  
        if (itemId === -1) {  
          throw new Error('No items found in the list');  
        }  
    
        latestItemId = itemId;  
        this.updateStatus(`Loading information about item ID: ${itemId}...`);  
          
        return this.context.spHttpClient.get(`${this.context.pageContext.web.absoluteUrl}/_api/web/lists/getbytitle('${this.properties.listName}')/items(${latestItemId})?$select=Title,Id`,  
          SPHttpClient.configurations.v1,  
          {  
            headers: {  
              'Accept': 'application/json;odata=nometadata',  
              'odata-version': ''  
            }  
          });  
      })  
      .then((response: SPHttpClientResponse): Promise<IListItem> => {  
        return response.json();  
      })  
      .then((item: IListItem): void => {  
        this.updateStatus(`Item ID1: ${item.Id}`);  
    
        const body: string = JSON.stringify({  
          'EnrollmentCompleted': `${new Date().toJSON()}`  
        });  
    
        this.context.spHttpClient.post(`${this.context.pageContext.web.absoluteUrl}/_api/web/lists/getbytitle('${this.properties.listName}')/items(${item.Id})`,  
          SPHttpClient.configurations.v1,  
          {  
            headers: {  
              'Accept': 'application/json;odata=nometadata',  
              'Content-type': 'application/json;odata=nometadata',  
              'odata-version': '',  
              'IF-MATCH': '*',  
              'X-HTTP-Method': 'MERGE'  
            },  
            body: body  
          })  
          .then((response: SPHttpClientResponse): void => {  
            $.modal.defaults = { closeExisting: true };
            $.modal.close();
            this.updateStatus(`Item with ID: ${latestItemId} successfully updated`);  
          }, (error: any): void => {  
            this.updateStatus(`Error updating item: ${error}`);  
          });  
      });  
  }  
}
