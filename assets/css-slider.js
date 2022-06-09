if ( typeof CSSSlider !== 'function' ) {

  class CSSSlider extends HTMLElement {

    constructor(){

      super();

      this._touchScreen = 'ontouchstart' in window || window.DocumentTouch && document instanceof DocumentTouch;
      const ua = navigator.userAgent.toLowerCase();
      this._ios15 = this._touchScreen && ua.includes('applewebkit') && ( ua.includes('os 15_') || ua.includes('version/15') );

      // create option object, from defaults
      this.o = {
        ...{
          selector: '.css-slide', 
          snapping: true, 
          groupCells: false,
          autoHeight: false, 
          navigation: true,
          navigationDOM: `<span class="css-slider-button css-slider-prev" style="display:none">←</span>
            <span class="css-slider-button css-slider-next" style="display:none">→</span>`,
          thumbnails: true,
          thumbnailsDOM: `<div class="css-slider-dot-navigation" style="display:none"></div>`,
          indexNav: false,
          indexNavDOM: `<div class="css-slider-index-navigation"><span class="css-slider-current">1</span> / <span class="css-slider-total">1</span></div>`,
          watchCSS: false,
          undisplay: false,
          listenScroll: false
        }, ...JSON.parse(this.dataset.options)
      };

      // init slider or watch for css
      if ( ! this.o.watchCSS ) {
        this.initSlider();
      } else {
        this.RESIZE_WATCHER = debounce(()=>{
          const afterContent = window.getComputedStyle(this,':after').content;
          if ( afterContent.includes('css-slide') && !this.sliderEnabled ) {
            this.initSlider();
          } else if ( !afterContent.includes('css-slide') && this.sliderEnabled )  { 
            this.destroySlider();
          }
        }, 100);
        window.addEventListener('resize', this.RESIZE_WATCHER);
        this.RESIZE_WATCHER();
      }

    
    }

    destroySlider(){
      this.innerHTML = `${this.originalHTML}`;
      this.classList.remove('enabled');
      this.sliderEnabled = false;
      window.removeEventListener('resize', this.RESIZE_EVENT);
      window.removeEventListener('scroll', this.SCROLL_EVENT);
      window.removeEventListener('scroll', this.SCROLL_EVENT_ANIMATION);
      window.preloadImages(this);
    }

    initSlider(){

      // create custom events

      this._readyEvent = new CustomEvent('ready');
      this._changeEvent = new CustomEvent('change');
      this._scrollEvent = new CustomEvent('scroll');
      this._navEvent = new CustomEvent('navigation');
      this._pointerDownEvent = new CustomEvent('pointerDown');
      this._pointerUpEvent = new CustomEvent('pointerUp');

      // create slider structure

      this.classList.add('css-slider');
      this.originalHTML = this.innerHTML;
      this.innerHTML = `<div class="css-slider-viewport">
        <div class="css-slider-holder">
          <div class="css-slider-container">
            ${this.originalHTML}
          </div>
        </div>
      </div>`;

      window.preloadImages(this);
      
      // add css-slide to children, if it's not set

      if ( this.o.undisplay ) {
        this.querySelectorAll(`${this.o.selector}`).forEach((elm)=>{
          elm.style.display = 'block';
        })
      }

      if ( this.o.selector != '.css-slide' ) {
        this.querySelectorAll(`${this.o.selector}`).forEach((elm)=>{
          elm.classList.add('css-slide');
        })
      }

      // setup variables

      this.element = this.querySelector('.css-slider-holder');
      if ( this.o.groupCells ) {
        this.element.scrollLeft = 0;
      }

      this.items = this.querySelectorAll(`${this.o.selector}`);
      this.indexedItems = [];
      this.index = 0;
      this.length = this.items.length;
      this.windowWidth = window.innerWidth;
      
      this.viewport = this.querySelector('.css-slider-viewport');
      if ( this.o.autoHeight ) {
        this.viewport.classList.add('auto-height');
      }

      // append navigation

      if ( this.o.navigation || this.o.thumbnails || this.indexNav ) {

        let container = document.createElement('div');
        container.classList.add('css-slider-navigation-container');
        container.innerHTML = `
          ${(this.o.navigation ? this.o.navigationDOM : '')}
          ${(this.o.thumbnails ? this.o.thumbnailsDOM : '')}
          ${(this.o.indexNav ? this.o.indexNavDOM : '')}`;

        if ( this.o.navigation ) {
          this.prevEl = container.querySelector('.css-slider-prev');
          this.prevEl.addEventListener('click', e=>{
            this.changeSlide('prev');
            this.dispatchEvent(this._navEvent);
          });
          this.nextEl = container.querySelector('.css-slider-next');
          this.nextEl.addEventListener('click', e=>{
            this.changeSlide('next');
            this.dispatchEvent(this._navEvent);
          });
        }

        if ( this.o.thumbnails ) {
          this.thumbnailsEl = container.querySelector('.css-slider-dot-navigation'); 
        }

        if ( this.o.indexNav ) {
          this.indexEl = container.querySelector('.css-slider-current');
          this.lengthEl = container.querySelector('.css-slider-total'); 
        }

        this.append(container);

      }

      if ( this.length > 1 ) {

        // observer for slides

        this.RESIZE_EVENT = debounce(()=>{
          if ( this.windowWidth != window.innerWidth && this.o.groupCells) {
            this.resetSlider();
          }
          if ( ! this.o.groupCells ) {
            this.checkSlide();
          }
          this.windowWidth = window.innerWidth;
        }, 100);
        window.addEventListener('resize', this.RESIZE_EVENT);
        this.resetSlider(true);    

        // dispatching scroll event, mostly for extra animations
        if ( this.o.listenScroll ) {
          this.SCROLL_EVENT_ANIMATIONS = (()=>{
            let slidesWidth = -this.querySelector('.css-slider-container').offsetWidth;
            this.items.forEach(elm=>{slidesWidth += elm.offsetWidth});
            this.progress = this.element.scrollLeft / slidesWidth;
            this.dispatchEvent(this._scrollEvent);
          });
          this.element.addEventListener('scroll', this.SCROLL_EVENT_ANIMATIONS, {passive:true});
        }

        this.SCROLL_EVENT = debounce(()=>{
          // checking selected index
          if ( ! this._sliderBlockScroll ) {
            const scrollItems = this.indexedItems.entries();
            const scrollArray = Array.from(scrollItems, elm => Math.abs(elm[1].offsetLeft-this.element.scrollLeft));
            const scrollDistance = Math.min(...scrollArray);
            const scrollIndex = scrollArray.indexOf(scrollDistance);
            /*if ( this.indexedItems[this.length-2].offsetLeft-this.element.scrollLeft < 0 ) {
              this.index = this.length - 1;
              this.checkSlide();
              this.dispatchEvent(this._changeEvent);
            } else */if ( scrollIndex != this.index ) {
              this.index = scrollIndex;
              this.checkSlide();
              this.dispatchEvent(this._changeEvent);
            }

          }
        }, 10);

        // mouse fallback for non-touch devices

        this.element.addEventListener('scroll', this.SCROLL_EVENT, {passive:true});

        if ( ! this._touchScreen && ! this.element.classList.contains('css-slider--singular') ) {
          this.element.addEventListener('mousedown', e=>{
            if ( ! this.element.classList.contains('css-slider--disable-dragging') ) {
              this.mouseX = e.screenX;
              this.element.classList.add('can-drag');
              this.element.classList.add('mouse-down');
            }
          });
          this.element.addEventListener('mouseup', e=>{
            this.element.classList.remove('mouse-down');
            this.element.classList.remove('can-drag');
            this.element.classList.remove('pointer-events-off');
          });

          this.element.addEventListener('mouseleave', e=>{
            this.element.classList.remove('mouse-down');
            this.element.classList.remove('can-drag');
            this.element.classList.remove('pointer-events-off');
          });

          this.element.addEventListener('mousemove', e=>{
            if ( this.element.classList.contains('can-drag') ) {
              this.element.classList.add('pointer-events-off');
              let direction = this.mouseX - e.screenX;
              if ( Math.abs(direction) > 1 ) {
                if ( direction > 0 ) {
                  this.changeSlide('next');
                  this.element.classList.remove('can-drag');
                } else if ( direction < 0 ) {
                  this.changeSlide('prev');
                  this.element.classList.remove('can-drag');
                }
              }
            }
          });

        }

        // helper for browser that don't support smooth scrolling

        if ( ! ( "scrollBehavior" in document.documentElement.style ) && ! this._touchScreen ) {
          this.element.classList.add('force-disable-snapping');
        }

      }

      // dispatch ready event

      this.classList.add('enabled');
      this.sliderEnabled = true;
      this.dispatchEvent(this._readyEvent);

    }

    changeSlide(direction, behavior='smooth'){

      // function that changes the slide, either by word (next/prev) or index

      if ( direction == 'next' ) {
        if ( this.index+1 < this.length ) {
          this.index++;
        }
      } else if ( direction == 'prev') {
        if ( this.index-1 >= 0 ) {
          this.index--;
        }
      } else if ( parseInt(direction) >= 0 ) {
        this.index = parseInt(direction);
      }

      this._sliderBlockScroll = true;
      if ( this._ios15 ) {
        this.element.classList.add('force-disable-snapping');
      }
      setTimeout(()=>{
        this._sliderBlockScroll = false;
        if ( this._ios15 ) {
          this.element.classList.remove('force-disable-snapping');
        }
      }, 500);

      this.checkSlide();

      this.element.scrollTo({
        top: 0,
        left: this.indexedItems[this.index].offsetLeft - parseInt(getComputedStyle(this.indexedItems[0]).marginLeft),
        behavior: behavior
      });
      this.dispatchEvent(this._changeEvent);

    }

    checkSlide(){  
      
      // checks slide after index change and updates navigation / viewport

      if ( this.o.navigation ) {
        this.prevEl.classList.remove('disabled');
        this.nextEl.classList.remove('disabled');
        if ( this.index == 0 ) {
          this.prevEl.classList.add('disabled');
        }
        if ( this.index == this.length - 1 ) {
          this.nextEl.classList.add('disabled');
        }
      }

      if ( this.o.thumbnails && this.thumbnails ) {
        this.thumbnails.forEach(elm=>{elm.classList.remove('active')});
        this.thumbnails[this.index].classList.add('active');
      }

      if ( this.o.indexNav ) {
        this.indexEl.textContent = this.index+1;
      }
      
      if ( this.o.autoHeight ) {
        this.viewport.style.height = this.indexedItems[this.index].offsetHeight + 'px';
      } 
      
      this.indexedItems.forEach((elm,i)=>{
        if ( i == this.index ) {
          elm.classList.add('css-slide-active');
        } else {
          elm.classList.remove('css-slide-active');
        }
      });

    }

    afterAppend(){
      this.items = this.querySelectorAll(`${this.o.selector}`);
    }

    resetSlider(nojump=false,resetIndex=true){

      let slidesWidth = 0,
          slidesPerPage = 1,
          page = 0,
          pages = 0,
          totalWidth = this.querySelector('.css-slider-container').offsetWidth,// - 20,
          hideNavigation = false;

      // reset entire slider

      this.indexedItems = [];
      this.element.classList.add('disable-snapping');

      this.indexedItems = this.querySelectorAll('.css-slide--snap');
      if ( resetIndex ) {
        this.index = 0;
      }
      this.length = Math.ceil(this.items.length / slidesPerPage);

      // recreate navigation

      if ( this.o.thumbnails ) {
        this.thumbnailsEl.innerHTML = '';
        for ( let i = 0; i < this.length; i++ ) {
          let dot = document.createElement('span');
          dot.classList.add('css-slider-dot');
          dot.dataset.index = i;
          this.thumbnailsEl.appendChild(dot);
          dot.addEventListener('click', (e)=>{
            this.changeSlide(e.target.dataset.index);
          });
        }
        this.thumbnails = this.thumbnailsEl.querySelectorAll('.css-slider-dot');
      }

      if ( this.o.indexNav ) {
        this.indexEl.textContent = this.index+1;
        this.lengthEl.textContent = this.length;
      }

      // hide navigation if only one slide

      if ( hideNavigation ) {
        this.element.classList.add('css-slider--no-drag');
        if ( this.o.navigation ) {
          this.prevEl.style.display = 'none';
          this.nextEl.style.display = 'none';
        }
        if ( this.o.thumbnails ) {
          this.thumbnailsEl.style.display = 'none';
        }
      } else {
        this.element.classList.remove('css-slider--no-drag');
        if ( this.o.navigation ) {
          this.prevEl.style.display = 'block';
          this.nextEl.style.display = 'block';
        }
        if ( this.o.thumbnails ) {
          this.thumbnailsEl.style.display = 'block';
        }
      }

      this.checkSlide();

      if ( ! nojump ) {
        this.element.scrollTo({
          top: 0,
          left: 0,
          behavior: 'auto'
        })
      }
      this.element.classList.remove('disable-snapping');

    }

  }

  if ( typeof customElements.get('css-slider') == 'undefined' ) {
    customElements.define('css-slider', CSSSlider);
  }
  
}